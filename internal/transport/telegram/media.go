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

// isDisappearingMedia проверяет, является ли сообщение исчезающим (view-once) медиа.
// В Telegram исчезающие фото и видео в личных чатах имеют HasProtectedContent = true
// (так как Telegram запрещает их пересылку и сохранение).
// Обычные сообщения, кружки (video_note), обычные фото/видео, стикеры имеют HasProtectedContent = false.
func isDisappearingMedia(m *models.Message) bool {
	if m == nil || !m.HasProtectedContent {
		return false
	}
	// Исчезающими медиа могут быть только фото или видео (и одноразовые голосовые).
	// Кружки (video_note), анимации/гифки, стикеры, документы исчезающими быть не могут.
	return len(m.Photo) > 0 || m.Video != nil || m.Voice != nil
}

// tryRescueMedia пытается "спасти" исчезающее медиа из сообщения, на которое
// ответил владелец. Срабатывает ТОЛЬКО для исчезающих медиа (view-once).
// Обычные фото, видео, кружочки (video_note), стикеры и документы игнорируются.
// Логика:
//  1. Проверяем, что сообщение действительно исчезающее.
//  2. Через GetFile получаем путь к файлу на серверах Telegram.
//  3. Скачиваем байты, пока файл ещё доступен.
//  4. Сохраняем копию на диск и отправляем владельцу в личный чат.
func (r *Runner) tryRescueMedia(ctx context.Context, ownerChatID int64, replied *models.Message) {
	if !isDisappearingMedia(replied) {
		return // не исчезающее медиа — игнорируем
	}

	media, ok := extractMedia(replied)
	if !ok {
		return // в reply нет медиа — спасать нечего
	}

	// Разрешаем только исчезающие фото, видео и голосовые (кружки, стикеры и т.д. отсекаются)
	if media.kind != "photo" && media.kind != "video" && media.kind != "voice" {
		return
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
	case "video":
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
