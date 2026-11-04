package telegram

import (
	"context"

	"github.com/go-telegram/bot/models"
)

// handleBusinessConnection срабатывает, когда владелец подключает (или отключает)
// бота в настройках Telegram Business. Мы запоминаем связь:
//
//	connection_id  <->  user_id (владелец)  <->  user_chat_id (куда слать алерты).
//
// Без этой записи мы не будем знать, в какой чат отправлять уведомления об
// удалениях и правках.
func (r *Runner) handleBusinessConnection(ctx context.Context, bc *models.BusinessConnection) {
	canReply := bc.Rights != nil && bc.Rights.CanReply
	ownerName := senderName(&bc.User)

	err := r.vault.SaveConnection(ctx, bc.ID, bc.User.ID, bc.UserChatID, ownerName, canReply, bc.IsEnabled)
	if err != nil {
		r.log.Error("не удалось сохранить business_connection", "id", bc.ID, "err", err)
		return
	}

	r.log.Info("business_connection обновлено",
		"id", bc.ID, "user_id", bc.User.ID, "enabled", bc.IsEnabled)

	if r.hub != nil {
		r.hub.Broadcast("connection_updated", map[string]any{
			"connection_id": bc.ID,
			"user_id":       bc.User.ID,
			"user_name":     ownerName,
			"is_enabled":    bc.IsEnabled,
		})
	}

	// Приветствуем владельца в его личном чате с ботом.
	if bc.IsEnabled {
		msg := "✅ <b>Бот подключён к вашему аккаунту.</b>\n\n" +
			"Теперь я пересылаю вам сообщения из ваших личных переписок и буду " +
			"сообщать об удалениях и правках. Команда /status — проверить состояние."
		if !canReply {
			msg += "\n\n⚠️ <b>Опция «Разрешить отвечать на сообщения» выключена.</b>\n" +
				"Отправка сообщений, медиа и удаление из веб-панели будут заблокированы.\n" +
				"Чтобы отвечать из веб-интерфейса, откройте в Telegram:\n" +
				"<i>Настройки → Telegram для бизнеса → Чат-боты → выберите бота → включите «Разрешить отвечать»</i>."
		}
		r.send(ctx, bc.UserChatID, msg)
	} else {
		r.send(ctx, bc.UserChatID, "⛔️ Бот отключён от аккаунта. Логирование приостановлено.")
	}
}
