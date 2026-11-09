-- +goose Up
-- +goose StatementBegin
ALTER TABLE tracked_messages ADD COLUMN IF NOT EXISTS reply_to_message_id BIGINT;
ALTER TABLE tracked_messages ADD COLUMN IF NOT EXISTS reply_to_sender_name TEXT;
ALTER TABLE tracked_messages ADD COLUMN IF NOT EXISTS reply_to_text TEXT;

CREATE INDEX IF NOT EXISTS idx_tracked_reply_to ON tracked_messages (chat_id, reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_tracked_reply_to;
ALTER TABLE tracked_messages DROP COLUMN IF EXISTS reply_to_text;
ALTER TABLE tracked_messages DROP COLUMN IF EXISTS reply_to_sender_name;
ALTER TABLE tracked_messages DROP COLUMN IF EXISTS reply_to_message_id;
-- +goose StatementEnd
