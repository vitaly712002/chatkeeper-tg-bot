package telegram

import (
	"context"
	"errors"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// handleDeletedBusinessMessages срабатывает, когда сообщения удаляют. Telegram
// присылает только ID удалённых сообщений (сам текст уже "пропал"), поэтому мы
// достаём оригиналы из нашей базы и показываем владельцу, что именно удалили.
func (r *Runner) handleDeletedBusinessMessages(ctx context.Context, d *models.BusinessMessagesDeleted) {
	conn, err := r.vault.GetConnection(ctx, d.BusinessConnectionID)
	if err != nil {
		r.log.Error("deleted: нет данных о подключении", "err", err)
		return
	}

	for _, msgID := range d.MessageIDs {
		// Помечаем сообщение удалённым в базе (для показа в веб-панели).
		if err := r.vault.MarkDeleted(ctx, d.BusinessConnectionID, d.Chat.ID, int64(msgID)); err != nil {
			r.log.Error("не удалось пометить сообщение удалённым", "msg_id", msgID, "err", err)
		}

		saved, err := r.vault.GetDeleted(ctx, d.BusinessConnectionID, d.Chat.ID, int64(msgID))
		if errors.Is(err, service.ErrNotFound) {
			// Не нашли в базе — скорее всего, сообщение было до запуска бота.
			continue
		}
		if err != nil {
			r.log.Error("не удалось достать удалённое сообщение", "msg_id", msgID, "err", err)
			continue
		}

		// Не отправляем уведомление, если владелец удалил своё собственное сообщение.
		if saved.IsOutgoing {
			continue
		}

		r.reportDeleted(ctx, conn.UserChatID, saved)
	}
}

// reportDeleted формирует и отправляет владельцу отчёт об удалённом сообщении.
func (r *Runner) reportDeleted(ctx context.Context, ownerChatID int64, saved service.SavedMessage) {
	if saved.IsOutgoing {
		return
	}

	text := "🗑 <b>Удалено сообщение</b>\n" +
		"От: " + esc(saved.SenderName) + "\n" +
		"Отправлено: " + fmtTime(saved.SentAt) + "\n"
	if saved.Text != "" {
		text += "\n<b>Текст:</b>\n" + esc(saved.Text)
	}
	if saved.MediaType != "" {
		text += "\n\n📎 Было вложение: " + saved.MediaType
	}
	r.send(ctx, ownerChatID, text)

	// Если было медиа — попробуем переслать его копию по сохранённому file_id.
	if saved.MediaType != "" && saved.FileID != "" {
		r.resendByFileID(ctx, ownerChatID, saved.MediaType, saved.FileID)
	}
}

// resendByFileID пересылает медиа владельцу по сохранённому file_id.
// Для обычных (не исчезающих) медиа file_id остаётся валидным.
func (r *Runner) resendByFileID(ctx context.Context, chatID int64, kind, fileID string) {
	input := &models.InputFileString{Data: fileID}
	caption := "📎 Вложение из удалённого сообщения"

	var err error
	switch kind {
	case "photo":
		_, err = r.bot.SendPhoto(ctx, &bot.SendPhotoParams{ChatID: chatID, Photo: input, Caption: caption})
	case "video", "video_note", "animation":
		_, err = r.bot.SendVideo(ctx, &bot.SendVideoParams{ChatID: chatID, Video: input, Caption: caption})
	case "voice":
		_, err = r.bot.SendVoice(ctx, &bot.SendVoiceParams{ChatID: chatID, Voice: input, Caption: caption})
	default:
		_, err = r.bot.SendDocument(ctx, &bot.SendDocumentParams{ChatID: chatID, Document: input, Caption: caption})
	}
	if err != nil {
		r.log.Error("не удалось переслать вложение удалённого сообщения", "err", err)
	}
}
