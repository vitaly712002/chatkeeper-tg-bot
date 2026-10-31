package telegram

import (
	"context"
	"errors"

	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// handleEditedBusinessMessage срабатывает, когда собеседник (или сам владелец)
// редактирует ранее отправленное сообщение. Мы:
//  1. Находим оригинал в базе.
//  2. Сохраняем старую версию текста в message_edits.
//  3. Обновляем текущий текст.
//  4. Отправляем владельцу diff «Было → Стало».
func (r *Runner) handleEditedBusinessMessage(ctx context.Context, m *models.Message) {
	conn, err := r.vault.GetConnection(ctx, m.BusinessConnectionID)
	if err != nil {
		r.log.Error("edited: нет данных о подключении", "err", err)
		return
	}

	res, changed, err := r.vault.SaveEdit(ctx, m.BusinessConnectionID, m.Chat.ID, int64(m.ID), messageText(m))
	if errors.Is(err, service.ErrNotFound) {
		// Оригинала нет в базе (пришёл до запуска бота) — просто пересохраним.
		r.handleBusinessMessage(ctx, m)
		return
	}
	if err != nil {
		r.log.Error("не удалось обработать правку", "err", err)
		return
	}
	if !changed {
		return // текст не менялся (например, правка только медиа)
	}

	text := "✏️ <b>Сообщение изменено</b>\n" +
		"От: " + esc(res.SenderName) + "\n\n" +
		"<b>Было:</b>\n" + esc(res.OldText) + "\n\n" +
		"<b>Стало:</b>\n" + esc(res.NewText)
	r.send(ctx, conn.UserChatID, text)
}
