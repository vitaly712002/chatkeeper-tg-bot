-- +goose Up
-- +goose StatementBegin

-- Бизнес-подключения: связь "аккаунт владельца <-> бот".
-- Появляется, когда владелец подключает бота в настройках Telegram Business.
CREATE TABLE business_connections (
    id VARCHAR(128) PRIMARY KEY,       -- business_connection_id от Telegram
    user_id BIGINT NOT NULL,           -- Telegram ID владельца аккаунта
    user_chat_id BIGINT NOT NULL,      -- Личный чат владельца с ботом (куда слать алерты)
    can_reply BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Сохранённые сообщения из личных переписок владельца.
CREATE TABLE tracked_messages (
    id BIGSERIAL PRIMARY KEY,
    connection_id VARCHAR(128) NOT NULL REFERENCES business_connections(id) ON DELETE CASCADE,
    chat_id BIGINT NOT NULL,           -- ID чата переписки
    message_id BIGINT NOT NULL,        -- Telegram ID сообщения
    sender_id BIGINT NOT NULL,         -- Кто отправил
    sender_name TEXT NOT NULL,         -- Имя автора
    is_outgoing BOOLEAN NOT NULL,      -- true = отправил сам владелец
    encrypted_text BYTEA,              -- Зашифрованный текст (может быть NULL для чистого медиа)
    media_type VARCHAR(32),            -- photo, video, voice, document и т.п.
    file_id TEXT,                      -- file_id для повторной отправки через Telegram
    local_path TEXT,                   -- Локальный путь (если файл скачан на диск)
    sent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, chat_id, message_id)
);

-- История правок: при каждом редактировании сохраняем ПРЕДЫДУЩИЙ текст.
CREATE TABLE message_edits (
    id BIGSERIAL PRIMARY KEY,
    message_ref_id BIGINT NOT NULL REFERENCES tracked_messages(id) ON DELETE CASCADE,
    encrypted_old_text BYTEA NOT NULL,
    edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для быстрого поиска сообщения при удалении/редактировании.
CREATE INDEX idx_tracked_lookup ON tracked_messages (connection_id, chat_id, message_id);
-- Индекс для быстрой TTL-очистки по дате.
CREATE INDEX idx_tracked_created_at ON tracked_messages (created_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS message_edits;
DROP TABLE IF EXISTS tracked_messages;
DROP TABLE IF EXISTS business_connections;
-- +goose StatementEnd
