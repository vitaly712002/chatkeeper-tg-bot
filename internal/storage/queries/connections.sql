-- name: UpsertConnection :one
-- Создаёт или обновляет бизнес-подключение.
-- ON CONFLICT: если подключение с таким id уже есть — обновляем его поля.
INSERT INTO business_connections (id, user_id, user_chat_id, user_name, can_reply, is_enabled, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    user_chat_id = EXCLUDED.user_chat_id,
    user_name = COALESCE(EXCLUDED.user_name, business_connections.user_name),
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

-- name: ListUsers :many
-- Список подключённых аккаунтов Telegram Business с агрегированной статистикой.
SELECT
    bc.id AS connection_id,
    bc.user_id,
    COALESCE(
        NULLIF(bc.user_name, ''),
        NULLIF((SELECT tm.sender_name FROM tracked_messages tm WHERE tm.connection_id = bc.id AND tm.is_outgoing = TRUE ORDER BY tm.sent_at DESC LIMIT 1), ''),
        CONCAT('User ', bc.user_id)
    ) AS user_name,
    bc.is_enabled,
    COUNT(DISTINCT tm.chat_id) AS chats_count,
    COUNT(tm.id) AS messages_count,
    MAX(tm.sent_at) AS last_at
FROM business_connections bc
LEFT JOIN tracked_messages tm ON tm.connection_id = bc.id
GROUP BY bc.id, bc.user_id, bc.user_name, bc.is_enabled
ORDER BY last_at DESC NULLS LAST;
