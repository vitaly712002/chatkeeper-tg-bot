-- name: UpsertConnection :one
-- Создаёт или обновляет бизнес-подключение.
-- ON CONFLICT: если подключение с таким id уже есть — обновляем его поля.
INSERT INTO business_connections (id, user_id, user_chat_id, can_reply, is_enabled, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW())
ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    user_chat_id = EXCLUDED.user_chat_id,
    can_reply = EXCLUDED.can_reply,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = NOW()
RETURNING *;

-- name: GetConnection :one
SELECT * FROM business_connections WHERE id = $1;

-- name: GetConnectionByUser :one
-- Последнее подключение данного владельца (для команд в личке бота).
SELECT * FROM business_connections WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1;

-- name: SetConnectionEnabled :exec
UPDATE business_connections SET is_enabled = $2, updated_at = NOW() WHERE id = $1;
