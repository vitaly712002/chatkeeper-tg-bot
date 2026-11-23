// Package storage — слой доступа к базе данных PostgreSQL.
//
// Здесь собрано три вещи:
//  1. Подключение к базе через пул соединений (pgxpool).
//  2. Автоматический накат миграций при старте (goose + embed.FS).
//  3. Обёртка Store поверх сгенерированного sqlc-кода, включая транзакции.
package storage

import (
	"context"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/vitaly/chatkeeper-tg-bot/internal/storage/gen"
)

// migrationsFS "вшивает" SQL-файлы миграций прямо в бинарник.
// Благодаря этому на сервере не нужно копировать отдельные .sql файлы —
// всё уже внутри исполняемого файла.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store — главная точка доступа к данным. Внутри держит пул соединений
// и сгенерированные sqlc-запросы (*gen.Queries).
type Store struct {
	pool *pgxpool.Pool
	*gen.Queries
}

// New подключается к базе, накатывает миграции и возвращает готовый Store.
func New(ctx context.Context, dbURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return nil, fmt.Errorf("не удалось создать пул соединений: %w", err)
	}

	// Проверяем, что база действительно доступна.
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("база недоступна (ping): %w", err)
	}

	if err := runMigrations(ctx, dbURL); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ошибка миграций: %w", err)
	}

	return &Store{
		pool:    pool,
		Queries: gen.New(pool),
	}, nil
}

// runMigrations применяет все миграции из вшитой файловой системы.
// goose работает поверх стандартного database/sql, поэтому мы открываем
// отдельное соединение через pgx-адаптер stdlib.
func runMigrations(ctx context.Context, dbURL string) error {
	db, err := goose.OpenDBWithDriver("pgx", dbURL)
	if err != nil {
		// pgx регистрируется как driver "pgx" через stdlib (импорт ниже).
		return fmt.Errorf("открытие БД для миграций: %w", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}

	if err := goose.UpContext(ctx, db, "migrations"); err != nil {
		return fmt.Errorf("goose up: %w", err)
	}
	return nil
}

// _ гарантирует, что драйвер pgx зарегистрирован в database/sql под именем "pgx".
var _ = stdlib.GetDefaultDriver

// Close закрывает пул соединений. Вызывать при завершении работы.
func (s *Store) Close() {
	s.pool.Close()
}

// WithTx выполняет функцию fn внутри одной транзакции.
// Если fn вернула ошибку — транзакция откатывается (ROLLBACK),
// иначе фиксируется (COMMIT). Это гарантирует атомарность: либо все
// изменения применились, либо ни одно.
func (s *Store) WithTx(ctx context.Context, fn func(q *gen.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("не удалось начать транзакцию: %w", err)
	}
	// Если забудем/упадём — Rollback сработает (после Commit он no-op).
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := fn(s.Queries.WithTx(tx)); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("не удалось зафиксировать транзакцию: %w", err)
	}
	return nil
}

// Ping проверяет доступность базы (используется в /status).
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// UpdateMessageLocalPath привязывает путь к сохранённому файлу на диске по file_id.
func (s *Store) UpdateMessageLocalPath(ctx context.Context, fileID, localPath string) error {
	_, err := s.pool.Exec(ctx,
		"UPDATE tracked_messages SET local_path = $1 WHERE file_id = $2",
		localPath, fileID,
	)
	return err
}

// ClearAllMessageLocalPaths сбрасывает все ссылки на сохранённые локальные файлы.
func (s *Store) ClearAllMessageLocalPaths(ctx context.Context) error {
	_, err := s.pool.Exec(ctx,
		"UPDATE tracked_messages SET local_path = NULL WHERE local_path IS NOT NULL AND local_path != ''",
	)
	return err
}

// GetLocalPathByFileID ищет сохранённый локальный путь по file_id.
func (s *Store) GetLocalPathByFileID(ctx context.Context, fileID string) (string, error) {
	var path string
	err := s.pool.QueryRow(ctx,
		"SELECT local_path FROM tracked_messages WHERE file_id = $1 AND local_path IS NOT NULL AND local_path != '' LIMIT 1",
		fileID,
	).Scan(&path)
	if err != nil {
		return "", err
	}
	return path, nil
}

// GetLastConnectionByChat ищет connection_id последнего сообщения в данном чате.
func (s *Store) GetLastConnectionByChat(ctx context.Context, chatID int64) (string, error) {
	var connID string
	err := s.pool.QueryRow(ctx,
		"SELECT connection_id FROM tracked_messages WHERE chat_id = $1 ORDER BY id DESC LIMIT 1",
		chatID,
	).Scan(&connID)
	return connID, err
}

// GetChatParticipants возвращает имена владельца и собеседника чата.
func (s *Store) GetChatParticipants(ctx context.Context, chatID int64) (owner string, partner string) {
	var o, p *string
	_ = s.pool.QueryRow(ctx, `
		SELECT
			(SELECT tm.sender_name FROM tracked_messages tm WHERE tm.chat_id = $1 AND tm.is_outgoing = TRUE ORDER BY tm.sent_at DESC LIMIT 1),
			(SELECT tm.sender_name FROM tracked_messages tm WHERE tm.chat_id = $1 AND tm.is_outgoing = FALSE ORDER BY tm.sent_at DESC LIMIT 1)
	`, chatID).Scan(&o, &p)
	owner = "Вы"
	partner = "Собеседник"
	if o != nil && *o != "" {
		owner = *o
	}
	if p != nil && *p != "" {
		partner = *p
	}
	return owner, partner
}

// ListMessagesFiltered возвращает сообщения с возможностью фильтрации по типу медиа,
// подключению и пагинации (before).
func (s *Store) ListMessagesFiltered(ctx context.Context, connectionID string, chatID int64, mediaType string, limit int32, before int64) ([]gen.ListRecentMessagesRow, error) {
	query := `
SELECT
    tm.id, tm.message_id, tm.sender_name, COALESCE(tm.recipient_name, '') AS recipient_name, tm.is_outgoing, tm.encrypted_text,
    tm.media_type, tm.file_id, tm.sent_at, tm.deleted_at, tm.is_read,
    tm.reply_to_message_id, tm.reply_to_sender_name, tm.reply_to_text,
    EXISTS(SELECT 1 FROM message_edits e WHERE e.message_ref_id = tm.id) AS edited
FROM tracked_messages tm
WHERE tm.chat_id = $1`

	args := []any{chatID}
	argIdx := 2

	if connectionID != "" {
		query += fmt.Sprintf(" AND tm.connection_id = $%d", argIdx)
		args = append(args, connectionID)
		argIdx++
	}
	if mediaType != "" {
		query += fmt.Sprintf(" AND tm.media_type = $%d", argIdx)
		args = append(args, mediaType)
		argIdx++
	}
	if before > 0 {
		query += fmt.Sprintf(" AND tm.id < $%d", argIdx)
		args = append(args, before)
		argIdx++
	}
	query += fmt.Sprintf(" ORDER BY tm.id DESC LIMIT $%d", argIdx)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []gen.ListRecentMessagesRow
	for rows.Next() {
		var i gen.ListRecentMessagesRow
		if err := rows.Scan(
			&i.ID,
			&i.MessageID,
			&i.SenderName,
			&i.RecipientName,
			&i.IsOutgoing,
			&i.EncryptedText,
			&i.MediaType,
			&i.FileID,
			&i.SentAt,
			&i.DeletedAt,
			&i.IsRead,
			&i.ReplyToMessageID,
			&i.ReplyToSenderName,
			&i.ReplyToText,
			&i.Edited,
		); err != nil {
			return nil, err
		}
		items = append(items, i)
	}
	return items, nil
}

// Чтобы линтер не ругался на неиспользуемый импорт pgx в некоторых сборках.
var _ = pgx.ErrNoRows
