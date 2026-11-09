-- name: InsertMessage :one
-- Сохраняет новое сообщение. Если вдруг такое уже есть (повтор апдейта),
-- обновляем изменяемые поля и возвращаем существующую запись.
INSERT INTO tracked_messages (
    connection_id, chat_id, message_id, sender_id, sender_name, recipient_name,
    is_outgoing, encrypted_text, media_type, file_id, local_path, sent_at, is_read,
    reply_to_message_id, reply_to_sender_name, reply_to_text
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
ON CONFLICT (connection_id, chat_id, message_id) DO UPDATE SET
    encrypted_text = EXCLUDED.encrypted_text,
    media_type = EXCLUDED.media_type,
    file_id = EXCLUDED.file_id,
    local_path = COALESCE(EXCLUDED.local_path, tracked_messages.local_path),
    recipient_name = COALESCE(EXCLUDED.recipient_name, tracked_messages.recipient_name),
    reply_to_message_id = COALESCE(EXCLUDED.reply_to_message_id, tracked_messages.reply_to_message_id),
    reply_to_sender_name = COALESCE(EXCLUDED.reply_to_sender_name, tracked_messages.reply_to_sender_name),
    reply_to_text = COALESCE(EXCLUDED.reply_to_text, tracked_messages.reply_to_text)
RETURNING *;

-- name: GetMessage :one
SELECT * FROM tracked_messages
WHERE connection_id = $1 AND chat_id = $2 AND message_id = $3;

-- name: UpdateMessageText :exec
-- Обновляет текст сообщения (после редактирования).
UPDATE tracked_messages SET encrypted_text = $2 WHERE id = $1;

-- name: CountMessagesByConnection :one
SELECT COUNT(*) FROM tracked_messages WHERE connection_id = $1;

-- name: DeleteOldMessages :execrows
-- Удаляет сообщения старше заданной даты (TTL-очистка).
-- Возвращает количество удалённых строк.
DELETE FROM tracked_messages WHERE created_at < $1;

-- name: MarkMessageDeleted :exec
-- Помечает сообщение удалённым (для показа в веб-панели).
UPDATE tracked_messages SET deleted_at = NOW()
WHERE connection_id = $1 AND chat_id = $2 AND message_id = $3;

-- name: GetMessageByID :one
SELECT * FROM tracked_messages WHERE id = $1;

-- === Запросы для веб-API ===

-- name: ListChats :many
-- Список диалогов: для каждого chat_id — счётчики, время и превью последнего
-- сообщения, а также имена обоих участников (владельца и собеседника).
SELECT
    t.chat_id AS chat_id,
    COUNT(*) AS msg_count,
    COUNT(*) FILTER (WHERE t.deleted_at IS NOT NULL) AS deleted_count,
    COUNT(*) FILTER (WHERE t.is_read = FALSE AND t.is_outgoing = FALSE) AS unread_count,
    MAX(t.sent_at) AS last_at,
    COALESCE(
        NULLIF((SELECT t2.sender_name FROM tracked_messages t2 WHERE t2.chat_id = t.chat_id AND t2.is_outgoing = FALSE ORDER BY t2.sent_at DESC LIMIT 1), ''),
        NULLIF((SELECT t2.recipient_name FROM tracked_messages t2 WHERE t2.chat_id = t.chat_id AND t2.is_outgoing = TRUE AND t2.recipient_name IS NOT NULL ORDER BY t2.sent_at DESC LIMIT 1), ''),
        'Собеседник'
    ) AS partner_name,
    COALESCE(
        NULLIF((SELECT t2.sender_name FROM tracked_messages t2 WHERE t2.chat_id = t.chat_id AND t2.is_outgoing = TRUE ORDER BY t2.sent_at DESC LIMIT 1), ''),
        NULLIF((SELECT t2.recipient_name FROM tracked_messages t2 WHERE t2.chat_id = t.chat_id AND t2.is_outgoing = FALSE AND t2.recipient_name IS NOT NULL ORDER BY t2.sent_at DESC LIMIT 1), ''),
        'Вы'
    ) AS owner_name,
    (SELECT t3.encrypted_text FROM tracked_messages t3
        WHERE t3.chat_id = t.chat_id ORDER BY t3.sent_at DESC LIMIT 1) AS last_encrypted_text,
    (SELECT t4.media_type FROM tracked_messages t4
        WHERE t4.chat_id = t.chat_id ORDER BY t4.sent_at DESC LIMIT 1) AS last_media_type
FROM tracked_messages t
GROUP BY t.chat_id
ORDER BY last_at DESC;

-- name: ListChatsByConnection :many
-- Список диалогов конкретного пользователя/подключения.
SELECT
    t.chat_id AS chat_id,
    COUNT(*) AS msg_count,
    COUNT(*) FILTER (WHERE t.deleted_at IS NOT NULL) AS deleted_count,
    COUNT(*) FILTER (WHERE t.is_read = FALSE AND t.is_outgoing = FALSE) AS unread_count,
    MAX(t.sent_at) AS last_at,
    COALESCE(
        NULLIF((SELECT t2.sender_name FROM tracked_messages t2 WHERE t2.connection_id = t.connection_id AND t2.chat_id = t.chat_id AND t2.is_outgoing = FALSE ORDER BY t2.sent_at DESC LIMIT 1), ''),
        NULLIF((SELECT t2.recipient_name FROM tracked_messages t2 WHERE t2.connection_id = t.connection_id AND t2.chat_id = t.chat_id AND t2.is_outgoing = TRUE AND t2.recipient_name IS NOT NULL ORDER BY t2.sent_at DESC LIMIT 1), ''),
        'Собеседник'
    ) AS partner_name,
    COALESCE(
        NULLIF((SELECT t2.sender_name FROM tracked_messages t2 WHERE t2.connection_id = t.connection_id AND t2.chat_id = t.chat_id AND t2.is_outgoing = TRUE ORDER BY t2.sent_at DESC LIMIT 1), ''),
        NULLIF((SELECT t2.recipient_name FROM tracked_messages t2 WHERE t2.connection_id = t.connection_id AND t2.chat_id = t.chat_id AND t2.is_outgoing = FALSE AND t2.recipient_name IS NOT NULL ORDER BY t2.sent_at DESC LIMIT 1), ''),
        'Вы'
    ) AS owner_name,
    (SELECT t3.encrypted_text FROM tracked_messages t3
        WHERE t3.connection_id = t.connection_id AND t3.chat_id = t.chat_id ORDER BY t3.sent_at DESC LIMIT 1) AS last_encrypted_text,
    (SELECT t4.media_type FROM tracked_messages t4
        WHERE t4.connection_id = t.connection_id AND t4.chat_id = t.chat_id ORDER BY t4.sent_at DESC LIMIT 1) AS last_media_type
FROM tracked_messages t
WHERE t.connection_id = $1
GROUP BY t.connection_id, t.chat_id
ORDER BY last_at DESC;

-- name: ListRecentMessages :many
-- Последние сообщения чата (новые сверху). Флаг edited — есть ли правки.
SELECT
    tm.id, tm.message_id, tm.sender_name, COALESCE(tm.recipient_name, '') AS recipient_name, tm.is_outgoing, tm.encrypted_text,
    tm.media_type, tm.file_id, tm.sent_at, tm.deleted_at, tm.is_read,
    tm.reply_to_message_id, tm.reply_to_sender_name, tm.reply_to_text,
    EXISTS(SELECT 1 FROM message_edits e WHERE e.message_ref_id = tm.id) AS edited
FROM tracked_messages tm
WHERE tm.chat_id = $1
ORDER BY tm.id DESC
LIMIT $2;

-- name: ListRecentMessagesByConn :many
-- Последние сообщения чата конкретного подключения.
SELECT
    tm.id, tm.message_id, tm.sender_name, COALESCE(tm.recipient_name, '') AS recipient_name, tm.is_outgoing, tm.encrypted_text,
    tm.media_type, tm.file_id, tm.sent_at, tm.deleted_at, tm.is_read,
    tm.reply_to_message_id, tm.reply_to_sender_name, tm.reply_to_text,
    EXISTS(SELECT 1 FROM message_edits e WHERE e.message_ref_id = tm.id) AS edited
FROM tracked_messages tm
WHERE tm.connection_id = $1 AND tm.chat_id = $2
ORDER BY tm.id DESC
LIMIT $3;

-- name: ListMessagesBefore :many
-- Более ранние сообщения чата (для подгрузки истории вверх).
SELECT
    tm.id, tm.message_id, tm.sender_name, COALESCE(tm.recipient_name, '') AS recipient_name, tm.is_outgoing, tm.encrypted_text,
    tm.media_type, tm.file_id, tm.sent_at, tm.deleted_at, tm.is_read,
    tm.reply_to_message_id, tm.reply_to_sender_name, tm.reply_to_text,
    EXISTS(SELECT 1 FROM message_edits e WHERE e.message_ref_id = tm.id) AS edited
FROM tracked_messages tm
WHERE tm.chat_id = $1 AND tm.id < $2
ORDER BY tm.id DESC
LIMIT $3;

-- name: ListMessagesBeforeByConn :many
-- Более ранние сообщения чата конкретного подключения.
SELECT
    tm.id, tm.message_id, tm.sender_name, COALESCE(tm.recipient_name, '') AS recipient_name, tm.is_outgoing, tm.encrypted_text,
    tm.media_type, tm.file_id, tm.sent_at, tm.deleted_at, tm.is_read,
    tm.reply_to_message_id, tm.reply_to_sender_name, tm.reply_to_text,
    EXISTS(SELECT 1 FROM message_edits e WHERE e.message_ref_id = tm.id) AS edited
FROM tracked_messages tm
WHERE tm.connection_id = $1 AND tm.chat_id = $2 AND tm.id < $3
ORDER BY tm.id DESC
LIMIT $4;

-- name: GetMessageByTelegramID :one
SELECT * FROM tracked_messages
WHERE chat_id = $1 AND message_id = $2
ORDER BY id DESC LIMIT 1;

-- name: MarkChatAsRead :execrows
-- Помечает все входящие непрочитанные сообщения чата как прочитанные.
UPDATE tracked_messages
SET is_read = TRUE, read_at = NOW()
WHERE chat_id = $1 AND is_read = FALSE;

-- name: MarkChatAsReadByConn :execrows
-- Помечает все входящие непрочитанные сообщения чата конкретного подключения как прочитанные.
UPDATE tracked_messages
SET is_read = TRUE, read_at = NOW()
WHERE connection_id = $1 AND chat_id = $2 AND is_read = FALSE;

-- name: GetEditsByMessage :many
-- Все предыдущие версии текста сообщения (от старой к новой).
SELECT encrypted_old_text, edited_at FROM message_edits
WHERE message_ref_id = $1
ORDER BY edited_at ASC;

-- name: GetStats :one
SELECT
    COUNT(*) AS total_messages,
    COUNT(DISTINCT chat_id) AS total_chats,
    COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_count
FROM tracked_messages;

-- name: CountEdits :one
SELECT COUNT(*) FROM message_edits;

-- name: InsertEdit :exec
-- Сохраняет предыдущую версию текста перед правкой.
INSERT INTO message_edits (message_ref_id, encrypted_old_text)
VALUES ($1, $2);

-- name: ClearAllMessages :execrows
-- Полностью удаляет все сохранённые сообщения из базы данных (каскадно удаляя и message_edits).
DELETE FROM tracked_messages;

-- name: ClearAllEdits :execrows
-- Полностью удаляет все записи истории правок.
DELETE FROM message_edits;
