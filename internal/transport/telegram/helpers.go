package telegram

import (
	"crypto/sha256"
	"encoding/hex"
	"html"
	"strings"
	"time"

	"github.com/go-telegram/bot/models"
)

// webhookSecret детерминированно выводит секретный токен для webhook из токена
// бота. Так его не нужно хранить отдельно: он одинаковый при каждом запуске.
func webhookSecret(botToken string) string {
	sum := sha256.Sum256([]byte("webhook:" + botToken))
	return hex.EncodeToString(sum[:])
}

// senderName собирает читаемое имя отправителя из полей User.
func senderName(u *models.User) string {
	if u == nil {
		return "Неизвестный"
	}
	name := strings.TrimSpace(u.FirstName + " " + u.LastName)
	if name == "" && u.Username != "" {
		name = "@" + u.Username
	}
	if name == "" {
		return "Неизвестный"
	}
	return name
}

// mediaInfo — тип медиа и его file_id (берём максимальное качество для фото).
type mediaInfo struct {
	kind   string // "photo", "video", "voice", "document", ...
	fileID string
	ext    string // расширение для сохранения на диск
}

// extractMedia определяет, есть ли в сообщении медиа, и возвращает его данные.
// found=false означает, что медиа нет (только текст).
func extractMedia(m *models.Message) (info mediaInfo, found bool) {
	switch {
	case len(m.Photo) > 0:
		// Photo — массив размеров одного изображения; последний самый большой.
		biggest := m.Photo[len(m.Photo)-1]
		return mediaInfo{kind: "photo", fileID: biggest.FileID, ext: "jpg"}, true
	case m.Video != nil:
		return mediaInfo{kind: "video", fileID: m.Video.FileID, ext: "mp4"}, true
	case m.Voice != nil:
		return mediaInfo{kind: "voice", fileID: m.Voice.FileID, ext: "ogg"}, true
	case m.VideoNote != nil:
		return mediaInfo{kind: "video_note", fileID: m.VideoNote.FileID, ext: "mp4"}, true
	case m.Animation != nil:
		return mediaInfo{kind: "animation", fileID: m.Animation.FileID, ext: "mp4"}, true
	case m.Document != nil:
		return mediaInfo{kind: "document", fileID: m.Document.FileID, ext: ""}, true
	case m.Audio != nil:
		return mediaInfo{kind: "audio", fileID: m.Audio.FileID, ext: "mp3"}, true
	case m.Sticker != nil:
		return mediaInfo{kind: "sticker", fileID: m.Sticker.FileID, ext: "webp"}, true
	}
	return mediaInfo{}, false
}

// messageText возвращает текст сообщения: обычный Text или Caption (подпись к медиа).
func messageText(m *models.Message) string {
	if m.Text != "" {
		return m.Text
	}
	return m.Caption
}

// esc экранирует текст для безопасной вставки в HTML-разметку сообщения.
func esc(s string) string {
	return html.EscapeString(s)
}

// fmtTime форматирует время в читаемый вид.
func fmtTime(t time.Time) string {
	if t.IsZero() {
		return "?"
	}
	return t.Local().Format("02.01.2006 15:04")
}
