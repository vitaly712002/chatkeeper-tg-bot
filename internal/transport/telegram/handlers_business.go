package telegram

import (
	"context"
	"time"

	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// handleBusinessMessage — самый частый обработчик: приходит на каждое входящее
// и исходящее сообщение в личных чатах владельца. Задачи:
//  1. Сохранить сообщение (текст шифруется, у медиа запоминаем file_id).
//  2. Если это reply на исчезающее медиа — перехватить и спасти файл.
//
// Какие чаты вообще сюда попадают, определяется настройками Telegram Business
// (там владелец выбирает включённые/исключённые чаты) — отдельного фильтра в
// боте нет.
func (r *Runner) handleBusinessMessage(ctx context.Context, m *models.Message) {
	conn, err := r.vault.GetConnection(ctx, m.BusinessConnectionID)
	if err != nil {
		r.log.Error("business_message: нет данных о подключении", "conn", m.BusinessConnectionID, "err", err)
		return
	}

	// Исходящее = отправитель и есть владелец аккаунта.
	isOutgoing := m.From != nil && m.From.ID == conn.UserID

	media, hasMedia := extractMedia(m)
	in := service.IncomingMessage{
		ConnectionID: m.BusinessConnectionID,
		ChatID:       m.Chat.ID,
		MessageID:    int64(m.ID),
		SenderID:     senderID(m),
		SenderName:   senderName(m.From),
		IsOutgoing:   isOutgoing,
		Text:         messageText(m),
		SentAt:       time.Unix(int64(m.Date), 0),
	}
	if hasMedia {
		in.MediaType = media.kind
		in.FileID = media.fileID
	}

	if err := r.vault.SaveMessage(ctx, in); err != nil {
		r.log.Error("не удалось сохранить сообщение", "err", err)
		return
	}

	// Перехват исчезающих медиа: если владелец ответил (reply) на сообщение
	// с медиа — попробуем скачать оригинал, пока он не исчез.
	if m.ReplyToMessage != nil {
		r.tryRescueMedia(ctx, conn.UserChatID, m.ReplyToMessage)
	}
}

// senderID безопасно извлекает ID отправителя.
func senderID(m *models.Message) int64 {
	if m.From != nil {
		return m.From.ID
	}
	return 0
}
