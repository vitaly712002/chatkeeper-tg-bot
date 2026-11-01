package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
)

// GET /api/stats — сводка для дашборда.
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.vault.GetStats(r.Context())
	if err != nil {
		s.log.Error("stats", "err", err)
		writeError(w, http.StatusInternalServerError, "Ошибка получения статистики")
		return
	}
	storageInfo := service.GetStorageInfo(s.cfg.MediaDir)
	if s.media != nil {
		storageInfo.MediaFiles, storageInfo.MediaBytes = s.media.Stats()
	}
	stats.Storage = &storageInfo
	writeJSON(w, http.StatusOK, stats)
}

// GET /api/storage — информация о свободном месте на диске для медиа и базы данных.
func (s *Server) handleStorage(w http.ResponseWriter, r *http.Request) {
	info := service.GetStorageInfo(s.cfg.MediaDir)
	if s.media != nil {
		info.MediaFiles, info.MediaBytes = s.media.Stats()
	}
	writeJSON(w, http.StatusOK, info)
}

// POST /api/media/clean — удаляет все сохранённые файлы из media-директории и сбрасывает local_path в БД.
func (s *Server) handleCleanMedia(w http.ResponseWriter, r *http.Request) {
	var count int
	var freed int64
	var err error

	if s.media != nil {
		count, freed, err = s.media.CleanAll()
		if err != nil {
			s.log.Error("clean media files", "err", err)
			writeError(w, http.StatusInternalServerError, "Ошибка удаления файлов с диска")
			return
		}
	}

	if s.vault != nil {
		if err := s.vault.ClearAllLocalMedia(r.Context()); err != nil {
			s.log.Error("clear local media db paths", "err", err)
			writeError(w, http.StatusInternalServerError, "Ошибка обновления базы данных")
			return
		}
	}

	storageInfo := service.GetStorageInfo(s.cfg.MediaDir)
	if s.media != nil {
		storageInfo.MediaFiles, storageInfo.MediaBytes = s.media.Stats()
	}

	s.log.Info("медиафайлы очищены", "deleted_count", count, "freed_bytes", freed)

	writeJSON(w, http.StatusOK, map[string]any{
		"deleted_count": count,
		"freed_bytes":   freed,
		"storage":       storageInfo,
	})
}

// GET /api/users — список подключённых пользователей (аккаунтов Telegram Business).
func (s *Server) handleUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.vault.ListUsers(r.Context())
	if err != nil {
		s.log.Error("users", "err", err)
		writeError(w, http.StatusInternalServerError, "Ошибка получения пользователей")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

// GET /api/chats?connection_id= — список диалогов (опционально по connection_id).
func (s *Server) handleChats(w http.ResponseWriter, r *http.Request) {
	connID := r.URL.Query().Get("connection_id")
	chats, err := s.vault.ListChats(r.Context(), connID)
	if err != nil {
		s.log.Error("chats", "err", err)
		writeError(w, http.StatusInternalServerError, "Ошибка получения чатов")
		return
	}
	writeJSON(w, http.StatusOK, chats)
}

// GET /api/chats/{chatId}/messages?connection_id=&limit=&before= — лента сообщений чата.
func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	chatID, err := strconv.ParseInt(r.PathValue("chatId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный chatId")
		return
	}
	connID := r.URL.Query().Get("connection_id")
	limit := parseIntDefault(r.URL.Query().Get("limit"), 50)
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	before := parseIntDefault(r.URL.Query().Get("before"), 0)

	msgs, err := s.vault.ListMessages(r.Context(), connID, chatID, int32(limit), int64(before))
	if err != nil {
		s.log.Error("messages", "err", err)
		writeError(w, http.StatusInternalServerError, "Ошибка получения сообщений")
		return
	}
	writeJSON(w, http.StatusOK, msgs)
}

// GET /api/messages/{id}/edits — история правок сообщения.
func (s *Server) handleEdits(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный id")
		return
	}
	edits, err := s.vault.GetEdits(r.Context(), id)
	if errors.Is(err, service.ErrNotFound) {
		writeError(w, http.StatusNotFound, "Сообщение не найдено")
		return
	}
	if err != nil {
		s.log.Error("edits", "err", err)
		writeError(w, http.StatusInternalServerError, "Ошибка получения истории")
		return
	}
	writeJSON(w, http.StatusOK, edits)
}

func parseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
