package telegram

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

// tryRescueMedia пытается "спасти" исчезающее медиа из сообщения, на которое
// ответил владелец. Логика:
//  1. Находим медиа в reply-сообщении.
//  2. Через GetFile получаем путь к файлу на серверах Telegram.
//  3. Скачиваем байты, пока файл ещё доступен.
//  4. Сохраняем копию на диск и отправляем владельцу в личный чат.
//
// Если медиа обычное (не исчезающее), ничего страшного — просто получим копию.
func (r *Runner) tryRescueMedia(ctx context.Context, ownerChatID int64, replied *models.Message) {
	media, ok := extractMedia(replied)
	if !ok {
		return // в reply нет медиа — спасать нечего
	}

	// Шаг 1: узнаём путь к файлу на серверах Telegram.
	file, err := r.bot.GetFile(ctx, &bot.GetFileParams{FileID: media.fileID})
	if err != nil {
		r.log.Error("GetFile не удался (возможно, файл уже исчез)", "err", err)
		return
	}

	// Шаг 2: скачиваем байты по прямой ссылке.
	data, err := r.downloadFile(ctx, r.bot.FileDownloadLink(file))
	if err != nil {
		r.log.Error("скачивание исчезающего медиа не удалось", "err", err)
		return
	}

	// Шаг 3: сохраняем копию на диск (на случай, если захотим потом).
	path, err := r.media.Save(data, media.ext)
	if err != nil {
		r.log.Error("не удалось сохранить медиа на диск", "err", err)
		// продолжаем — всё равно попробуем отправить владельцу
	} else {
		r.log.Info("исчезающее медиа спасено", "path", path, "kind", media.kind)
		// Привязываем сохранённый файл к сообщению в БД, чтобы веб-панель могла его отобразить и скачать
		if err := r.vault.SetMessageLocalPath(ctx, media.fileID, path); err != nil {
			r.log.Error("не удалось привязать local_path к сообщению", "err", err)
		}
	}

	// Шаг 4: отправляем копию владельцу. Загружаем именно байты (а не file_id),
	// потому что исходный file_id исчезающего медиа может стать недоступен.
	r.sendRescuedMedia(ctx, ownerChatID, media, data)
}

// downloadFile скачивает содержимое по URL.
func (r *Runner) downloadFile(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram вернул статус %d при скачивании файла", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// sendRescuedMedia отправляет спасённый файл владельцу подходящим методом.
func (r *Runner) sendRescuedMedia(ctx context.Context, chatID int64, media mediaInfo, data []byte) {
	caption := "📸 Спасённое исчезающее медиа (" + media.kind + ")"
	filename := "rescued"
	if media.ext != "" {
		filename += "." + media.ext
	}
	input := &models.InputFileUpload{Filename: filename, Data: bytes.NewReader(data)}

	var err error
	switch media.kind {
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
		r.log.Error("не удалось отправить спасённое медиа владельцу", "err", err)
	}
}
