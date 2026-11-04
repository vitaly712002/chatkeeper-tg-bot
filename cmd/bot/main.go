// Command bot — точка входа приложения. Здесь собираются вместе все слои:
// конфигурация → шифрование → база → сервисы → Telegram-транспорт.
// Также настраивается "graceful shutdown": при Ctrl+C или сигнале от системы
// бот аккуратно завершает работу (закрывает соединения с БД и т.п.).
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/vitaly/chatkeeper-tg-bot/internal/config"
	"github.com/vitaly/chatkeeper-tg-bot/internal/crypto"
	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
	"github.com/vitaly/chatkeeper-tg-bot/internal/storage"
	"github.com/vitaly/chatkeeper-tg-bot/internal/transport/httpapi"
	"github.com/vitaly/chatkeeper-tg-bot/internal/transport/telegram"
)

func main() {
	// Логгер с выводом в формате "ключ=значение" — удобно читать в терминале.
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if err := run(log); err != nil {
		log.Error("фатальная ошибка", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	// ctx отменяется при SIGINT (Ctrl+C) или SIGTERM (сигнал от Docker/systemd).
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// 1. Конфигурация из переменных окружения.
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log.Info("конфигурация загружена", "mode", cfg.Mode, "ttl_days", cfg.TTLDays)

	// 2. Шифровальщик для текстов сообщений.
	key, err := cfg.EncryptionKey()
	if err != nil {
		return err
	}
	cipher, err := crypto.New(key)
	if err != nil {
		return err
	}

	// 3. База данных (подключение + автоматические миграции).
	store, err := storage.New(ctx, cfg.DBURL)
	if err != nil {
		return err
	}
	defer store.Close()
	log.Info("база данных подключена, миграции применены")

	// 4. Сервисы (бизнес-логика).
	vault := service.NewVault(store, cipher)
	mediaStore, err := service.NewMediaStore(cfg.MediaDir)
	if err != nil {
		return err
	}

	// 5. Фоновый воркер TTL-очистки старых сообщений.
	cleaner := service.NewCleaner(store, cfg.TTLDays, cfg.CleanupInterval, log)
	go cleaner.Run(ctx)

	// 6. WebSocket Hub для отправки событий в веб-панель в реальном времени.
	wsHub := httpapi.NewHub(log)
	go wsHub.Run(ctx)

	// 7. Telegram-транспорт.
	runner, err := telegram.New(cfg, vault, mediaStore, wsHub, log)
	if err != nil {
		return err
	}

	// 8. REST API и WebSocket для веб-панели — в отдельной горутине (использует
	//    клиент бота для отдачи медиа).
	api := httpapi.New(cfg, vault, runner.Bot(), mediaStore, wsHub, log)
	go func() {
		if err := api.Start(ctx); err != nil {
			log.Error("REST API остановлен с ошибкой", "err", err)
		}
	}()

	// 9. Telegram-транспорт — запускается последним и блокирует до завершения.
	log.Info("бот запускается")
	if err := runner.Start(ctx); err != nil {
		return err
	}

	log.Info("бот остановлен")
	return nil
}
