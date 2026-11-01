package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/vitaly/chatkeeper-tg-bot/internal/storage/gen"
)

// Этот файл — «витрина» данных для веб-API: методы, которые достают из базы
// уже расшифрованные и готовые к показу структуры.

// UserSummary — аккаунт Telegram Business (пользователь бота).
type UserSummary struct {
	ConnectionID  string    `json:"connection_id"`
	UserID        int64     `json:"user_id"`
	UserName      string    `json:"user_name"`
	IsEnabled     bool      `json:"is_enabled"`
	ChatsCount    int64     `json:"chats_count"`
	MessagesCount int64     `json:"messages_count"`
	LastAt        time.Time `json:"last_at"`
}

// ChatSummary — строка в списке диалогов.
type ChatSummary struct {
	ChatID       int64     `json:"chat_id"`
	Title        string    `json:"title"`
	OwnerName    string    `json:"owner_name"`
	PartnerName  string    `json:"partner_name"`
	LastText     string    `json:"last_text"`
	LastAt       time.Time `json:"last_at"`
	Count        int64     `json:"count"`
	DeletedCount int64     `json:"deleted_count"`
}

// MessageView — сообщение для ленты (текст уже расшифрован).
type MessageView struct {
	ID            int64      `json:"id"`
	MessageID     int64      `json:"message_id"`
	SenderName    string     `json:"sender_name"`
	RecipientName string     `json:"recipient_name"`
	IsOutgoing    bool       `json:"is_outgoing"`
	Text          string     `json:"text"`
	MediaType     string     `json:"media_type"`
	FileID        string     `json:"file_id"`
	SentAt        time.Time  `json:"sent_at"`
	DeletedAt     *time.Time `json:"deleted_at"`
	Edited        bool       `json:"edited"`
}

// EditVersion — одна версия текста в истории правок.
type EditVersion struct {
	Text     string    `json:"text"`
	EditedAt time.Time `json:"edited_at"`
}

// Stats — сводка для дашборда.
type Stats struct {
	TotalMessages int64        `json:"total_messages"`
	TotalChats    int64        `json:"total_chats"`
	DeletedCount  int64        `json:"deleted_count"`
	EditedCount   int64        `json:"edited_count"`
	Storage       *StorageInfo `json:"storage,omitempty"`
}

// ListUsers возвращает список подключённых аккаунтов Telegram Business.
func (v *Vault) ListUsers(ctx context.Context) ([]UserSummary, error) {
	rows, err := v.store.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]UserSummary, 0, len(rows))
	for _, r := range rows {
		out = append(out, UserSummary{
			ConnectionID:  r.ConnectionID,
			UserID:        r.UserID,
			UserName:      r.UserName,
			IsEnabled:     r.IsEnabled,
			ChatsCount:    r.ChatsCount,
			MessagesCount: r.MessagesCount,
			LastAt:        asTime(r.LastAt),
		})
	}
	return out, nil
}

// ListChats возвращает список диалогов с превью последнего сообщения.
// Если connectionID задан, фильтрует только чаты этого пользователя/аккаунта.
func (v *Vault) ListChats(ctx context.Context, connectionID string) ([]ChatSummary, error) {
	var (
		rows []gen.ListChatsRow
		err  error
	)
	if connectionID != "" {
		rows, err = v.store.ListChatsByConnection(ctx, connectionID)
	} else {
		rows, err = v.store.ListChats(ctx)
	}
	if err != nil {
		return nil, err
	}
	out := make([]ChatSummary, 0, len(rows))
	for _, r := range rows {
		preview := ""
		if len(r.LastEncryptedText) > 0 {
			if s, derr := v.cipher.DecryptString(r.LastEncryptedText); derr == nil {
				preview = s
			}
		} else if r.LastMediaType != nil {
			preview = mediaLabel(*r.LastMediaType)
		}

		partner := asString(r.PartnerName)
		owner := asString(r.OwnerName)
		if partner == "" {
			partner = "Собеседник"
		}
		if owner == "" {
			owner = "Вы"
		}

		out = append(out, ChatSummary{
			ChatID:       r.ChatID,
			Title:        partner,
			OwnerName:    owner,
			PartnerName:  partner,
			LastText:     preview,
			LastAt:       asTime(r.LastAt),
			Count:        r.MsgCount,
			DeletedCount: r.DeletedCount,
		})
	}
	return out, nil
}

// ListMessages возвращает сообщения чата в хронологическом порядке (старые сверху).
// before=0 — последние сообщения; before>0 — более ранние, чем это id.
func (v *Vault) ListMessages(ctx context.Context, connectionID string, chatID int64, limit int32, before int64) ([]MessageView, error) {
	var (
		views []MessageView
		err   error
	)
	if connectionID != "" {
		if before > 0 {
			var rows []gen.ListMessagesBeforeRow
			rows, err = v.store.ListMessagesBeforeByConn(ctx, gen.ListMessagesBeforeByConnParams{
				ConnectionID: connectionID, ChatID: chatID, ID: before, Limit: limit,
			})
			if err == nil {
				views = make([]MessageView, 0, len(rows))
				for _, r := range rows {
					views = append(views, v.toMessageView(messageRow(r)))
				}
			}
		} else {
			var rows []gen.ListRecentMessagesRow
			rows, err = v.store.ListRecentMessagesByConn(ctx, gen.ListRecentMessagesByConnParams{
				ConnectionID: connectionID, ChatID: chatID, Limit: limit,
			})
			if err == nil {
				views = make([]MessageView, 0, len(rows))
				for _, r := range rows {
					views = append(views, v.toMessageView(r))
				}
			}
		}
	} else {
		if before > 0 {
			var rows []gen.ListMessagesBeforeRow
			rows, err = v.store.ListMessagesBefore(ctx, gen.ListMessagesBeforeParams{
				ChatID: chatID, ID: before, Limit: limit,
			})
			if err == nil {
				views = make([]MessageView, 0, len(rows))
				for _, r := range rows {
					views = append(views, v.toMessageView(messageRow(r)))
				}
			}
		} else {
			var rows []gen.ListRecentMessagesRow
			rows, err = v.store.ListRecentMessages(ctx, gen.ListRecentMessagesParams{
				ChatID: chatID, Limit: limit,
			})
			if err == nil {
				views = make([]MessageView, 0, len(rows))
				for _, r := range rows {
					views = append(views, v.toMessageView(r))
				}
			}
		}
	}
	if err != nil {
		return nil, err
	}
	// Запросы отдают новые-сверху; разворачиваем в старые-сверху для показа.
	reverse(views)
	return views, nil
}

// GetEdits возвращает полную историю версий текста сообщения: сначала старые
// версии из message_edits, в конце — текущий текст.
func (v *Vault) GetEdits(ctx context.Context, messageID int64) ([]EditVersion, error) {
	edits, err := v.store.GetEditsByMessage(ctx, messageID)
	if err != nil {
		return nil, err
	}
	msg, err := v.store.GetMessageByID(ctx, messageID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	out := make([]EditVersion, 0, len(edits)+1)
	for _, e := range edits {
		text := ""
		if len(e.EncryptedOldText) > 0 {
			if s, derr := v.cipher.DecryptString(e.EncryptedOldText); derr == nil {
				text = s
			}
		}
		out = append(out, EditVersion{Text: text, EditedAt: e.EditedAt.Time})
	}
	// Текущая версия.
	curText := ""
	if len(msg.EncryptedText) > 0 {
		if s, derr := v.cipher.DecryptString(msg.EncryptedText); derr == nil {
			curText = s
		}
	}
	out = append(out, EditVersion{Text: curText, EditedAt: msg.CreatedAt.Time})
	return out, nil
}

// GetStats собирает сводку для дашборда.
func (v *Vault) GetStats(ctx context.Context) (Stats, error) {
	s, err := v.store.GetStats(ctx)
	if err != nil {
		return Stats{}, err
	}
	edits, err := v.store.CountEdits(ctx)
	if err != nil {
		return Stats{}, err
	}
	return Stats{
		TotalMessages: s.TotalMessages,
		TotalChats:    s.TotalChats,
		DeletedCount:  s.DeletedCount,
		EditedCount:   edits,
	}, nil
}

// MarkDeleted помечает сообщение удалённым (вызывается из обработчика удалений).
func (v *Vault) MarkDeleted(ctx context.Context, connID string, chatID, msgID int64) error {
	return v.store.MarkMessageDeleted(ctx, gen.MarkMessageDeletedParams{
		ConnectionID: connID, ChatID: chatID, MessageID: msgID,
	})
}

// --- вспомогательное ---

// toMessageView превращает строку из БД в расшифрованный MessageView.
func (v *Vault) toMessageView(r gen.ListRecentMessagesRow) MessageView {
	text := ""
	if len(r.EncryptedText) > 0 {
		if s, err := v.cipher.DecryptString(r.EncryptedText); err == nil {
			text = s
		}
	}
	mv := MessageView{
		ID:            r.ID,
		MessageID:     r.MessageID,
		SenderName:    r.SenderName,
		RecipientName: r.RecipientName,
		IsOutgoing:    r.IsOutgoing,
		Text:          text,
		MediaType:     derefStr(r.MediaType),
		FileID:        derefStr(r.FileID),
		SentAt:        r.SentAt.Time,
		Edited:        r.Edited,
	}
	if r.DeletedAt.Valid {
		t := r.DeletedAt.Time
		mv.DeletedAt = &t
	}
	return mv
}

// messageRow приводит строку "Before"-запроса к общему типу (поля идентичны).
func messageRow(r gen.ListMessagesBeforeRow) gen.ListRecentMessagesRow {
	return gen.ListRecentMessagesRow{
		ID:            r.ID,
		MessageID:     r.MessageID,
		SenderName:    r.SenderName,
		RecipientName: r.RecipientName,
		IsOutgoing:    r.IsOutgoing,
		EncryptedText: r.EncryptedText,
		MediaType:     r.MediaType,
		FileID:        r.FileID,
		SentAt:        r.SentAt,
		DeletedAt:     r.DeletedAt,
		Edited:        r.Edited,
	}
}

func reverse(s []MessageView) {
	for i, j := 0, len(s)-1; i < j; i, j = i+1, j-1 {
		s[i], s[j] = s[j], s[i]
	}
}

// mediaLabel — человекочитаемая подпись для превью чата без текста.
func mediaLabel(kind string) string {
	switch kind {
	case "photo":
		return "📷 Фото"
	case "video", "video_note":
		return "🎞 Видео"
	case "voice":
		return "🎤 Голосовое"
	case "audio":
		return "🎵 Аудио"
	case "document":
		return "📄 Документ"
	case "sticker":
		return "🙂 Стикер"
	case "animation":
		return "🎞 GIF"
	default:
		return "📎 Вложение"
	}
}

func asString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func asTime(v interface{}) time.Time {
	if t, ok := v.(time.Time); ok {
		return t
	}
	return time.Time{}
}
