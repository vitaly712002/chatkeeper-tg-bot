-- +goose Up
-- +goose StatementBegin
ALTER TABLE tracked_messages ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE business_connections ADD COLUMN IF NOT EXISTS user_name TEXT;

-- Индексы для мгновенного выполнения запросов без seq scan
CREATE INDEX IF NOT EXISTS idx_tracked_conn_sent ON tracked_messages (connection_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_conn_chat_id ON tracked_messages (connection_id, chat_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_tracked_chat_id ON tracked_messages (chat_id, id DESC);

-- Backfill recipient_name for existing messages
-- For outgoing messages: recipient is the partner in that chat
UPDATE tracked_messages tm
SET recipient_name = sub.partner_name
FROM (
    SELECT DISTINCT ON (chat_id) chat_id, sender_name AS partner_name
    FROM tracked_messages
    WHERE is_outgoing = FALSE
    ORDER BY chat_id, sent_at DESC
) sub
WHERE tm.chat_id = sub.chat_id
  AND tm.is_outgoing = TRUE
  AND (tm.recipient_name IS NULL OR tm.recipient_name = '');

-- For incoming messages: recipient is the owner in that chat
UPDATE tracked_messages tm
SET recipient_name = sub.owner_name
FROM (
    SELECT DISTINCT ON (chat_id) chat_id, sender_name AS owner_name
    FROM tracked_messages
    WHERE is_outgoing = TRUE
    ORDER BY chat_id, sent_at DESC
) sub
WHERE tm.chat_id = sub.chat_id
  AND tm.is_outgoing = FALSE
  AND (tm.recipient_name IS NULL OR tm.recipient_name = '');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_tracked_conn_sent;
DROP INDEX IF EXISTS idx_tracked_conn_chat_id;
DROP INDEX IF EXISTS idx_tracked_chat_id;
ALTER TABLE tracked_messages DROP COLUMN IF EXISTS recipient_name;
ALTER TABLE business_connections DROP COLUMN IF EXISTS user_name;
-- +goose StatementEnd
