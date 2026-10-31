// Package service — бизнес-логика бота. Здесь нет ничего про Telegram и про
// то, как устроена база: эти детали спрятаны в transport/telegram и storage.
// Service оперирует понятными доменными терминами: "сохранить сообщение",
// "достать удалённое", "записать правку".
package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/vitaly/chatkeeper-tg-bot/internal/crypto"
	"github.com/vitaly/chatkeeper-tg-bot/internal/storage"
	"github.com/vitaly/chatkeeper-tg-bot/internal/storage/gen"
)

// Vault ("хранилище") — главный сервис: сохраняет сообщения в зашифрованном
// виде и достаёт их обратно.
type Vault struct {
	store  *storage.Store
	cipher *crypto.Cipher
}

// NewVault собирает сервис из хранилища и шифровальщика.
func NewVault(store *storage.Store, cipher *crypto.Cipher) *Vault {
	return &Vault{store: store, cipher: cipher}
}

// IncomingMessage — "сырьё" из Telegram, которое мы хотим сохранить.
// Транспортный слой заполняет эту структуру и передаёт сюда.
type IncomingMessage struct {
	ConnectionID string
	ChatID       int64
	MessageID    int64
	SenderID     int64
	SenderName   string
	IsOutgoing   bool
	Text         string // открытый текст; шифруется внутри сервиса
	MediaType    string // "" если медиа нет
	FileID       string // "" если медиа нет
	SentAt       time.Time
}

// SavedMessage — расшифрованное сообщение, готовое для показа владельцу.
type SavedMessage struct {
	SenderName string
	IsOutgoing bool
	Text       string
	MediaType  string
	FileID     string
	SentAt     time.Time
}

// ErrNotFound — сообщение не найдено в базе (например, пришло до запуска бота).
var ErrNotFound = errors.New("сообщение не найдено в хранилище")

// SaveConnection сохраняет/обновляет бизнес-подключение владельца.
func (v *Vault) SaveConnection(ctx context.Context, id string, userID, userChatID int64, canReply, enabled bool) error {
	_, err := v.store.UpsertConnection(ctx, gen.UpsertConnectionParams{
		ID:         id,
		UserID:     userID,
		UserChatID: userChatID,
		CanReply:   canReply,
		IsEnabled:  enabled,
	})
	return err
}

// GetConnection возвращает подключение по id (нужно, чтобы узнать, в какой
// чат слать алерты владельцу).
func (v *Vault) GetConnection(ctx context.Context, id string) (gen.BusinessConnection, error) {
	conn, err := v.store.GetConnection(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return gen.BusinessConnection{}, ErrNotFound
	}
	return conn, err
}

// GetConnectionByUser возвращает последнее подключение владельца по его user_id
// (нужно для команд в личке бота: /status, /stats).
func (v *Vault) GetConnectionByUser(ctx context.Context, userID int64) (gen.BusinessConnection, error) {
	conn, err := v.store.GetConnectionByUser(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return gen.BusinessConnection{}, ErrNotFound
	}
	return conn, err
}

// SaveMessage шифрует текст и записывает сообщение в базу.
func (v *Vault) SaveMessage(ctx context.Context, in IncomingMessage) error {
	var encText []byte
	if in.Text != "" {
		var err error
		encText, err = v.cipher.EncryptString(in.Text)
		if err != nil {
			return err
		}
	}

	_, err := v.store.InsertMessage(ctx, gen.InsertMessageParams{
		ConnectionID:  in.ConnectionID,
		ChatID:        in.ChatID,
		MessageID:     in.MessageID,
		SenderID:      in.SenderID,
		SenderName:    in.SenderName,
		IsOutgoing:    in.IsOutgoing,
		EncryptedText: encText,
		MediaType:     nullStr(in.MediaType),
		FileID:        nullStr(in.FileID),
		SentAt:        toTimestamptz(in.SentAt),
	})
	return err
}

// GetDeleted достаёт и расшифровывает сообщение, которое только что удалили.
func (v *Vault) GetDeleted(ctx context.Context, connID string, chatID, msgID int64) (SavedMessage, error) {
	row, err := v.store.GetMessage(ctx, gen.GetMessageParams{
		ConnectionID: connID,
		ChatID:       chatID,
		MessageID:    msgID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedMessage{}, ErrNotFound
	}
	if err != nil {
		return SavedMessage{}, err
	}
	return v.decrypt(row)
}

// EditResult — результат обработки правки.
type EditResult struct {
	SenderName string
	OldText    string
	NewText    string
}

// SaveEdit сохраняет предыдущую версию текста и обновляет текущую.
// Возвращает "было/стало" для показа владельцу. Если текст не менялся
// (например, отредактировали только медиа) — возвращает changed=false.
func (v *Vault) SaveEdit(ctx context.Context, connID string, chatID, msgID int64, newText string) (res EditResult, changed bool, err error) {
	row, err := v.store.GetMessage(ctx, gen.GetMessageParams{
		ConnectionID: connID,
		ChatID:       chatID,
		MessageID:    msgID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return EditResult{}, false, ErrNotFound
	}
	if err != nil {
		return EditResult{}, false, err
	}

	oldText := ""
	if len(row.EncryptedText) > 0 {
		oldText, err = v.cipher.DecryptString(row.EncryptedText)
		if err != nil {
			return EditResult{}, false, err
		}
	}

	if oldText == newText {
		return EditResult{}, false, nil // текст не изменился
	}

	// Всё в одной транзакции: записать старую версию + обновить текущую.
	err = v.store.WithTx(ctx, func(q *gen.Queries) error {
		if err := q.InsertEdit(ctx, gen.InsertEditParams{
			MessageRefID:     row.ID,
			EncryptedOldText: row.EncryptedText,
		}); err != nil {
			return err
		}
		newEnc, err := v.cipher.EncryptString(newText)
		if err != nil {
			return err
		}
		return q.UpdateMessageText(ctx, gen.UpdateMessageTextParams{
			ID:            row.ID,
			EncryptedText: newEnc,
		})
	})
	if err != nil {
		return EditResult{}, false, err
	}

	return EditResult{SenderName: row.SenderName, OldText: oldText, NewText: newText}, true, nil
}

// CountMessages — сколько сообщений сохранено для подключения (для /stats).
func (v *Vault) CountMessages(ctx context.Context, connID string) (int64, error) {
	return v.store.CountMessagesByConnection(ctx, connID)
}

// --- вспомогательные функции ---

func (v *Vault) decrypt(row gen.TrackedMessage) (SavedMessage, error) {
	text := ""
	if len(row.EncryptedText) > 0 {
		var err error
		text, err = v.cipher.DecryptString(row.EncryptedText)
		if err != nil {
			return SavedMessage{}, err
		}
	}
	return SavedMessage{
		SenderName: row.SenderName,
		IsOutgoing: row.IsOutgoing,
		Text:       text,
		MediaType:  derefStr(row.MediaType),
		FileID:     derefStr(row.FileID),
		SentAt:     row.SentAt.Time,
	}, nil
}

// nullStr: пустую строку превращаем в NULL (nil-указатель) для базы.
func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// toTimestamptz конвертирует time.Time в тип pgtype, который понимает pgx.
func toTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}
