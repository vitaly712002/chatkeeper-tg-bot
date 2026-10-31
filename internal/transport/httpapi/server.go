// Package httpapi — REST API для веб-панели просмотра переписок.
//
// Отдаёт JSON по путям /api/*. Все эндпоинты, кроме /api/auth/login, требуют
// JWT-токен (заголовок Authorization: Bearer ... или, для медиа, query ?t=...).
// Тексты сообщений расшифровываются здесь, на сервере, поэтому доступ к API
// обязан быть за HTTPS и за паролем.
package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-telegram/bot"

	"github.com/vitaly/chatkeeper-tg-bot/internal/config"
	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// Server держит зависимости API и сам http.Server.
type Server struct {
	cfg   config.Config
	vault *service.Vault
	bot   *bot.Bot
	log   *slog.Logger
	http  *http.Server
}

// New собирает маршруты и возвращает готовый сервер.
func New(cfg config.Config, vault *service.Vault, b *bot.Bot, log *slog.Logger) *Server {
	s := &Server{cfg: cfg, vault: vault, bot: b, log: log}

	mux := http.NewServeMux()

	// Публичный эндпоинт (без токена).
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)

	// Защищённые эндпоинты (оборачиваем в auth-middleware).
	mux.Handle("GET /api/stats", s.auth(http.HandlerFunc(s.handleStats)))
	mux.Handle("GET /api/chats", s.auth(http.HandlerFunc(s.handleChats)))
	mux.Handle("GET /api/chats/{chatId}/messages", s.auth(http.HandlerFunc(s.handleMessages)))
	mux.Handle("GET /api/messages/{id}/edits", s.auth(http.HandlerFunc(s.handleEdits)))
	// Медиа: токен может прийти в query (?t=...), т.к. <img> не шлёт заголовки.
	mux.Handle("GET /api/media/{fileId}", s.auth(http.HandlerFunc(s.handleMedia)))

	s.http = &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s
}

// Start запускает HTTP-сервер и останавливает его при отмене ctx.
func (s *Server) Start(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.http.Shutdown(shutdownCtx)
	}()

	s.log.Info("REST API запущен", "addr", s.cfg.APIAddr)
	if err := s.http.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// --- helpers для JSON-ответов ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
