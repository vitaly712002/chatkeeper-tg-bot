// Package config отвечает за чтение и валидацию настроек приложения
// из переменных окружения (ENV). Это подход "12-factor app": вся
// конфигурация живёт в окружении, а не в коде, поэтому один и тот же
// бинарник одинаково работает и на ноутбуке, и на сервере.
package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/caarlos0/env/v11"
)

// Mode — режим получения обновлений от Telegram.
type Mode string

const (
	// ModePolling — бот сам periodically спрашивает Telegram "есть ли новое?".
	// Удобно для локальной разработки: не нужен публичный HTTPS-адрес.
	ModePolling Mode = "polling"
	// ModeWebhook — Telegram сам стучится к нам по HTTPS, когда есть событие.
	// Так работают в продакшене (быстрее и экономичнее).
	ModeWebhook Mode = "webhook"
)

// Config — полный набор настроек бота. Теги `env:"..."` говорят библиотеке
// caarlos0/env, из какой переменной окружения читать значение.
type Config struct {
	// BotToken — секретный токен бота, который выдаёт @BotFather.
	BotToken string `env:"BOT_TOKEN,required"`

	// DBURL — строка подключения к PostgreSQL,
	// например: postgres://user:pass@localhost:5432/chatkeeper?sslmode=disable
	DBURL string `env:"DB_URL,required"`

	// EncryptionKeyHex — ключ шифрования AES-256 в виде hex-строки.
	// 256 бит = 32 байта = 64 hex-символа. Сгенерировать можно так:
	//   openssl rand -hex 32
	EncryptionKeyHex string `env:"ENCRYPTION_KEY,required"`

	// Mode — polling или webhook (см. выше).
	Mode Mode `env:"MODE" envDefault:"polling"`

	// WebhookURL — публичный HTTPS-адрес, на который Telegram шлёт обновления.
	// Нужен только в режиме webhook.
	WebhookURL string `env:"WEBHOOK_URL"`

	// ListenAddr — на каком адресе/порту слушать входящие webhook-запросы.
	ListenAddr string `env:"LISTEN_ADDR" envDefault:":8080"`

	// TTLDays — через сколько дней удалять старые сообщения из БД
	// (чтобы база не разрасталась бесконечно).
	TTLDays int `env:"TTL_DAYS" envDefault:"30"`

	// CleanupInterval — как часто запускать фоновую чистку старых записей.
	CleanupInterval time.Duration `env:"CLEANUP_INTERVAL" envDefault:"6h"`

	// MediaDir — папка на диске, куда сохраняются перехваченные
	// исчезающие медиафайлы.
	MediaDir string `env:"MEDIA_DIR" envDefault:"./data/media"`

	// === Настройки веб-панели (REST API) ===

	// APIAddr — адрес/порт HTTP-API для веб-панели.
	APIAddr string `env:"API_ADDR" envDefault:":8080"`

	// AdminUser / AdminPassword — учётные данные входа в веб-панель.
	AdminUser     string `env:"ADMIN_USER" envDefault:"admin"`
	AdminPassword string `env:"ADMIN_PASSWORD,required"`

	// JWTSecret — секрет для подписи JWT-токенов веб-панели.
	// Сгенерировать: openssl rand -hex 32
	JWTSecret string `env:"JWT_SECRET,required"`

	// JWTTTL — время жизни токена авторизации.
	JWTTTL time.Duration `env:"JWT_TTL" envDefault:"24h"`

	// WebDir — папка с собранной веб-панелью (frontend/dist). Если задана,
	// тот же HTTP-сервер отдаёт статику панели (SPA) помимо /api.
	// Пусто — панель не раздаётся (например, при локальной разработке через Vite).
	WebDir string `env:"WEB_DIR" envDefault:""`
}

// EncryptionKey декодирует hex-ключ в 32 байта и проверяет его длину.
// Возвращает ошибку, если ключ некорректный, — лучше упасть на старте,
// чем молча зашифровать всё слабым/битым ключом.
func (c Config) EncryptionKey() ([]byte, error) {
	key, err := hex.DecodeString(c.EncryptionKeyHex)
	if err != nil {
		return nil, fmt.Errorf("ENCRYPTION_KEY должен быть hex-строкой: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("ENCRYPTION_KEY должен быть 32 байта (64 hex-символа), сейчас %d байт", len(key))
	}
	return key, nil
}

// Load читает все переменные окружения в структуру Config
// и делает дополнительную проверку взаимосвязанных полей.
func Load() (Config, error) {
	var cfg Config
	if err := env.Parse(&cfg); err != nil {
		return Config{}, fmt.Errorf("не удалось прочитать конфигурацию: %w", err)
	}

	// Проверяем, что ключ шифрования валиден уже на старте.
	if _, err := cfg.EncryptionKey(); err != nil {
		return Config{}, err
	}

	// В режиме webhook обязателен публичный адрес.
	if cfg.Mode == ModeWebhook && cfg.WebhookURL == "" {
		return Config{}, errors.New("для MODE=webhook нужно задать WEBHOOK_URL")
	}

	if cfg.Mode != ModePolling && cfg.Mode != ModeWebhook {
		return Config{}, fmt.Errorf("неизвестный MODE=%q (допустимо: polling или webhook)", cfg.Mode)
	}

	// В режиме webhook бот поднимает свой HTTP-сервер на ListenAddr, а веб-API —
	// на APIAddr. Если они совпадают, второй не сможет занять порт.
	if cfg.Mode == ModeWebhook && cfg.APIAddr == cfg.ListenAddr {
		return Config{}, fmt.Errorf("API_ADDR (%s) и LISTEN_ADDR (%s) должны различаться в режиме webhook", cfg.APIAddr, cfg.ListenAddr)
	}

	return cfg, nil
}
