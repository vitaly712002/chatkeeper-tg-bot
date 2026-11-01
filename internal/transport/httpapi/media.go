package httpapi

import (
	"io"
	"net/http"
	"os"

	"github.com/go-telegram/bot"
)

// GET /api/media/{fileId} — отдаёт медиафайл по его file_id.
// Если файл сохранён на локальном диске (например, спасённое исчезающее фото) — отдаём его;
// иначе скачиваем с серверов Telegram через GetFile.
func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	fileID := r.PathValue("fileId")
	if fileID == "" {
		writeError(w, http.StatusBadRequest, "Нет fileId")
		return
	}

	// 1. Проверяем, есть ли сохранённая копия на локальном диске (спасённые исчезающие медиа)
	if localPath, err := s.vault.GetLocalPathByFileID(r.Context(), fileID); err == nil && localPath != "" {
		if _, err := os.Stat(localPath); err == nil {
			w.Header().Set("Cache-Control", "private, max-age=3600")
			http.ServeFile(w, r, localPath)
			return
		}
	}

	// 2. Если на диске нет — запрашиваем у серверов Telegram
	file, err := s.bot.GetFile(r.Context(), &bot.GetFileParams{FileID: fileID})
	if err != nil {
		s.log.Error("media GetFile", "err", err)
		writeError(w, http.StatusNotFound, "Файл недоступен")
		return
	}

	link := s.bot.FileDownloadLink(file)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, link, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка запроса файла")
		return
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.log.Error("media download", "err", err)
		writeError(w, http.StatusBadGateway, "Не удалось скачать файл")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		writeError(w, http.StatusNotFound, "Файл недоступен")
		return
	}

	// Пробрасываем тип содержимого и кешируем в браузере на час.
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, resp.Body)
}
