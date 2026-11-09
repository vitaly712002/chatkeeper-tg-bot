-- +goose Up
-- +goose StatementBegin
ALTER TABLE tracked_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tracked_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Исторические сообщения считаем прочитанными
UPDATE tracked_messages SET is_read = TRUE WHERE is_read = FALSE;

-- Индексы для мгновенного подсчета и выборки непрочитанных
CREATE INDEX IF NOT EXISTS idx_tracked_unread ON tracked_messages (chat_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_tracked_conn_unread ON tracked_messages (connection_id, chat_id, is_read) WHERE is_read = FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_tracked_unread;
DROP INDEX IF EXISTS idx_tracked_conn_unread;
ALTER TABLE tracked_messages DROP COLUMN IF EXISTS read_at;
ALTER TABLE tracked_messages DROP COLUMN IF EXISTS is_read;
-- +goose StatementEnd
