package telegram

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
	"github.com/vitaly/chatkeeper-tg-bot/internal/storage/gen"
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

// tryRescueMedia пытается "спасти" исчезающее медиа (из самого сообщения или из reply).
// Срабатывает ТОЛЬКО для исчезающих медиа (view-once).
// Обычные фото, видео, кружочки (video_note), стикеры и документы игнорируются.
// Логика:
//  1. Проверяем, что сообщение действительно исчезающее.
//  2. Скачиваем байты через GetFile, пока файл ещё доступен на серверах Telegram.
//  3. Сохраняем копию на локальный диск в media-хранилище.
//  4. Сохраняем/обновляем сообщение в tracked_messages с local_path,
//     чтобы веб-приложение могло сразу отобразить и открыть файл.
//  5. Если это чужое исчезающее медиа — отправляем владельцу копию в личный чат Telegram.
func (r *Runner) tryRescueMedia(ctx context.Context, conn gen.BusinessConnection, chatID int64, partner string, target *models.Message, isReply bool) {
	if !isDisappearingMedia(target) {
		return // не исчезающее медиа — игнорируем
	}

	media, ok := extractMedia(target)
	if !ok {
		return // нет медиа — спасать нечего
	}

	// Разрешаем только исчезающие фото, видео и голосовые (кружки, стикеры и т.д. отсекаются)
	if media.kind != "photo" && media.kind != "video" && media.kind != "voice" {
		return
	}

	// Определяем отправителя и получателя target-сообщения
	var targetSenderID int64
	var targetSenderName string
	var targetIsOutgoing bool
	if target.From != nil {
		targetSenderID = target.From.ID
		targetSenderName = senderName(target.From)
		targetIsOutgoing = target.From.ID == conn.UserID
	} else {
		// В личных чатах, если поле From отсутствует: автор — собеседник
		targetSenderName = partner
		targetIsOutgoing = false
	}

	var targetRecipient string
	if targetIsOutgoing {
		targetRecipient = partner
	} else if conn.UserName != nil && *conn.UserName != "" {
		targetRecipient = *conn.UserName
	} else {
		targetRecipient = "Вы"
	}

	sentAt := time.Now()
	if target.Date > 0 {
		sentAt = time.Unix(int64(target.Date), 0)
	}

	saveAndLink := func(savedPath string) {
		in := service.IncomingMessage{
			ConnectionID:  conn.ID,
			ChatID:        chatID,
			MessageID:     int64(target.ID),
			SenderID:      targetSenderID,
			SenderName:    targetSenderName,
			RecipientName: targetRecipient,
			IsOutgoing:    targetIsOutgoing,
			Text:          messageText(target),
			MediaType:     media.kind,
			FileID:        media.fileID,
			LocalPath:     savedPath,
			SentAt:        sentAt,
		}
		if _, err := r.vault.SaveMessage(ctx, in); err != nil {
			r.log.Error("не удалось сохранить спасённое сообщение в базу", "err", err)
		}
		if err := r.vault.SetMessageLocalPath(ctx, media.fileID, savedPath); err != nil {
			r.log.Error("не удалось привязать local_path к сообщению", "err", err)
		}
	}

	// Проверяем: возможно, этот файл уже был скачан и сохранён на диск ранее
	if existingPath, err := r.vault.GetLocalPathByFileID(ctx, media.fileID); err == nil && existingPath != "" {
		if _, err := os.Stat(existingPath); err == nil {
			saveAndLink(existingPath)
			return
		}
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

	// Шаг 3: сохраняем копию на диск.
	path, err := r.media.Save(data, media.ext)
	if err != nil {
		r.log.Error("не удалось сохранить медиа на диск", "err", err)
	} else {
		r.log.Info("исчезающее медиа спасено на диск", "path", path, "kind", media.kind)
		saveAndLink(path)
	}

	// Шаг 4: отправляем копию владельцу в личный чат бота, если это чужое исчезающее медиа и бот не на паузе.
	if !targetIsOutgoing && !conn.IsPaused {
		r.sendRescuedMedia(ctx, conn.UserChatID, media, data)
	}
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
