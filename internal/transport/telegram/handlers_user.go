package telegram

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// handleUserCommand обрабатывает команды, которые владелец пишет боту в личку:
// /start, /status.
func (r *Runner) handleUserCommand(ctx context.Context, m *models.Message) {
	if m.From == nil {
		return
	}
	userID := m.From.ID
	chatID := m.Chat.ID

	switch parseCommand(m.Text) {
	case "/start":
		r.send(ctx, chatID, startText)
	case "/status":
		r.cmdStatus(ctx, chatID, userID)
	default:
		// Непонятная команда или обычный текст — подсказываем /start.
		if strings.HasPrefix(m.Text, "/") {
			r.send(ctx, chatID, "Неизвестная команда. Наберите /start для списка возможностей.")
		}
	}
}

const startText = "👋 <b>Chatkeeper</b> — ваш личный архив переписок.\n\n" +
	"Я пересылаю вам сообщения из ваших личных чатов (через Telegram Business) и сообщаю об " +
	"удалениях и правках.\n\n" +
	"<b>Команды:</b>\n" +
	"/status — состояние подключения\n\n" +
	"⚠️ Чтобы всё заработало, подключите бота в настройках Telegram Business.\n" +
	"Какие чаты логировать (и какие исключить) — настраивается там же, в настройках Telegram."

func (r *Runner) cmdStatus(ctx context.Context, chatID, userID int64) {
	conn, err := r.vault.GetConnectionByUser(ctx, userID)
	if errors.Is(err, service.ErrNotFound) {
		r.send(ctx, chatID, "❌ Бот ещё не подключён к вашему аккаунту.\n"+
			"Откройте Настройки → Telegram для бизнеса → Чат-боты и добавьте этого бота.")
		return
	}
	if err != nil {
		r.send(ctx, chatID, "Ошибка при проверке статуса.")
		return
	}
	state := "включено ✅"
	if !conn.IsEnabled {
		state = "выключено ⛔️"
	}

	replyStatus := "включено ✅ (отправка из веба доступна)"
	if !conn.CanReply {
		replyStatus = "выключено ❌\n<i>Для включения: Настройки → Telegram для бизнеса → Чат-боты → включить «Разрешить отвечать»</i>"
	}

	r.send(ctx, chatID, fmt.Sprintf(
		"📊 <b>Статус подключения</b>\n\n"+
			"• Статус: %s\n"+
			"• Право отвечать: %s\n"+
			"• ID подключения: <code>%s</code>",
		state, replyStatus, esc(conn.ID)))
}

// parseCommand вытаскивает саму команду из текста, обрезая аргументы и имя бота
// (например, "/status@my_bot" -> "/status").
func parseCommand(text string) string {
	text = strings.TrimSpace(text)
	cmd := strings.SplitN(text, " ", 2)[0]
	if i := strings.Index(cmd, "@"); i != -1 {
		cmd = cmd[:i]
	}
	return cmd
}
