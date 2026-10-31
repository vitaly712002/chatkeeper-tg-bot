// Package telegram — транспортный слой. Он получает "сырые" обновления от
// Telegram, превращает их в понятные вызовы сервиса (service.Vault) и отправляет
// владельцу уведомления. Вся логика "что делать" — в service; здесь только
// "как это приходит из Telegram и как ответить".
package telegram

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/config"
	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// Runner владеет ботом и зависимостями, запускает приём обновлений.
type Runner struct {
	cfg   config.Config
	bot   *bot.Bot
	vault *service.Vault
	media *service.MediaStore
	log   *slog.Logger
}

// allowedUpdates — список типов обновлений, которые мы хотим получать.
// Telegram по умолчанию НЕ присылает business_* обновления, поэтому их нужно
// запросить явно. "message" — для команд в личке бота (/start и т.п.).
var allowedUpdates = bot.AllowedUpdates{
	models.AllowedUpdateMessage,
	models.AllowedUpdateBusinessConnection,
	models.AllowedUpdateBusinessMessage,
	models.AllowedUpdateEditedBusinessMessage,
	models.AllowedUpdateDeletedBusinessMessages,
}

// New создаёт Runner. Сам бот (*bot.Bot) настраивается здесь: мы задаём
// один общий обработчик (dispatch), который сам разбирает тип обновления.
func New(cfg config.Config, vault *service.Vault, media *service.MediaStore, log *slog.Logger) (*Runner, error) {
	r := &Runner{cfg: cfg, vault: vault, media: media, log: log}

	opts := []bot.Option{
		bot.WithDefaultHandler(r.dispatch),
		bot.WithAllowedUpdates(allowedUpdates),
	}
	// В режиме webhook секретный токен защищает endpoint от чужих запросов.
	if cfg.Mode == config.ModeWebhook {
		opts = append(opts, bot.WithWebhookSecretToken(webhookSecret(cfg.BotToken)))
	}

	b, err := bot.New(cfg.BotToken, opts...)
	if err != nil {
		return nil, fmt.Errorf("не удалось создать бота: %w", err)
	}
	r.bot = b
	return r, nil
}

// Bot возвращает низкоуровневый клиент бота (нужен веб-API для отдачи медиа).
func (r *Runner) Bot() *bot.Bot {
	return r.bot
}

// dispatch — единая точка входа для всех обновлений. Смотрим, какое поле
// заполнено, и вызываем соответствующий обработчик. Так новичку видно
// "карту" всех событий в одном месте.
func (r *Runner) dispatch(ctx context.Context, b *bot.Bot, update *models.Update) {
	switch {
	case update.BusinessConnection != nil:
		r.handleBusinessConnection(ctx, update.BusinessConnection)
	case update.BusinessMessage != nil:
		r.handleBusinessMessage(ctx, update.BusinessMessage)
	case update.EditedBusinessMessage != nil:
		r.handleEditedBusinessMessage(ctx, update.EditedBusinessMessage)
	case update.DeletedBusinessMessages != nil:
		r.handleDeletedBusinessMessages(ctx, update.DeletedBusinessMessages)
	case update.Message != nil && update.Message.Chat.Type == "private":
		r.handleUserCommand(ctx, update.Message)
	}
}

// Start запускает приём обновлений выбранным способом (polling или webhook)
// и блокируется до отмены ctx.
func (r *Runner) Start(ctx context.Context) error {
	switch r.cfg.Mode {
	case config.ModePolling:
		// На всякий случай убираем webhook, иначе polling не заработает.
		_, _ = r.bot.DeleteWebhook(ctx, &bot.DeleteWebhookParams{DropPendingUpdates: false})
		r.log.Info("запуск в режиме polling")
		r.bot.Start(ctx) // блокирующий вызов до отмены ctx
		return nil

	case config.ModeWebhook:
		_, err := r.bot.SetWebhook(ctx, &bot.SetWebhookParams{
			URL:            r.cfg.WebhookURL,
			AllowedUpdates: allowedUpdates,
			SecretToken:    webhookSecret(r.cfg.BotToken),
		})
		if err != nil {
			return fmt.Errorf("не удалось установить webhook: %w", err)
		}
		r.log.Info("запуск в режиме webhook", "addr", r.cfg.ListenAddr, "url", r.cfg.WebhookURL)

		// bot.StartWebhook обрабатывает очередь, а HTTP-сервер принимает запросы.
		go r.bot.StartWebhook(ctx)

		srv := &http.Server{Addr: r.cfg.ListenAddr, Handler: r.bot.WebhookHandler()}
		go func() {
			<-ctx.Done()
			_ = srv.Close()
		}()
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			return fmt.Errorf("http-сервер webhook: %w", err)
		}
		return nil

	default:
		return fmt.Errorf("неизвестный режим: %s", r.cfg.Mode)
	}
}

// send — короткая обёртка для отправки текстового сообщения владельцу.
func (r *Runner) send(ctx context.Context, chatID int64, text string) {
	_, err := r.bot.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:    chatID,
		Text:      text,
		ParseMode: models.ParseModeHTML,
	})
	if err != nil {
		r.log.Error("не удалось отправить сообщение владельцу", "chat_id", chatID, "err", err)
	}
}
