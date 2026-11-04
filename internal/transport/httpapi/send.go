package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/vitaly/chatkeeper-tg-bot/internal/service"
	"github.com/vitaly/chatkeeper-tg-bot/internal/storage/gen"
)

type SendMessageRequest struct {
	ConnectionID     string `json:"connection_id"`
	Text             string `json:"text"`
	ReplyToMessageID int64  `json:"reply_to_message_id,omitempty"`
}

func (s *Server) resolveConnection(r *http.Request, chatID int64, requestedConnID string) (gen.BusinessConnection, error) {
	connID := strings.TrimSpace(requestedConnID)
	if connID == "" {
		lastConn, err := s.vault.GetLastConnectionByChat(r.Context(), chatID)
		if err != nil {
			return gen.BusinessConnection{}, fmt.Errorf("не удалось определить подключение для чата %d: %w", chatID, err)
		}
		connID = lastConn
	}

	conn, err := s.vault.GetConnection(r.Context(), connID)
	if err != nil {
		return gen.BusinessConnection{}, fmt.Errorf("подключение %q не найдено: %w", connID, err)
	}

	if !conn.IsEnabled {
		return gen.BusinessConnection{}, errors.New("подключение Telegram Business отключено")
	}

	if !conn.CanReply {
		return gen.BusinessConnection{}, errors.New("у бота нет разрешения отвечать на сообщения (включите 'Разрешить отвечать на сообщения' в настройках Telegram Business)")
	}

	return conn, nil
}

// POST /api/chats/{chatId}/messages — отправка текстового сообщения в диалог Telegram Business.
func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	chatID, err := strconv.ParseInt(r.PathValue("chatId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный chatId")
		return
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный JSON запроса")
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		writeError(w, http.StatusBadRequest, "Текст сообщения не может быть пустым")
		return
	}

	conn, err := s.resolveConnection(r, chatID, req.ConnectionID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	params := &bot.SendMessageParams{
		BusinessConnectionID: conn.ID,
		ChatID:               chatID,
		Text:                 text,
	}
	if req.ReplyToMessageID > 0 {
		params.ReplyParameters = &models.ReplyParameters{
			MessageID: int(req.ReplyToMessageID),
		}
	}

	msg, err := s.bot.SendMessage(r.Context(), params)
	if err != nil {
		s.log.Error("send message error", "chat_id", chatID, "err", err)
		writeError(w, http.StatusBadRequest, "Ошибка отправки в Telegram: "+err.Error())
		return
	}

	owner, partner := s.vault.GetChatParticipants(r.Context(), chatID)
	if conn.UserName != nil && *conn.UserName != "" {
		owner = *conn.UserName
	}

	in := service.IncomingMessage{
		ConnectionID:  conn.ID,
		ChatID:        chatID,
		MessageID:     int64(msg.ID),
		SenderID:      conn.UserID,
		SenderName:    owner,
		RecipientName: partner,
		IsOutgoing:    true,
		Text:          text,
		SentAt:        time.Unix(int64(msg.Date), 0),
	}

	mv, err := s.vault.SaveMessage(r.Context(), in)
	if err != nil {
		s.log.Error("save sent message error", "chat_id", chatID, "err", err)
		writeError(w, http.StatusInternalServerError, "Сообщение отправлено, но не удалось сохранить в базу")
		return
	}

	if s.hub != nil {
		s.hub.Broadcast("message_created", map[string]any{
			"connection_id": conn.ID,
			"chat_id":       chatID,
			"message":       mv,
		})
	}

	writeJSON(w, http.StatusOK, mv)
}

// POST /api/chats/{chatId}/media — отправка фото, видео, голосовых или документов в Telegram Business.
func (s *Server) handleSendMedia(w http.ResponseWriter, r *http.Request) {
	chatID, err := strconv.ParseInt(r.PathValue("chatId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный chatId")
		return
	}

	// Ограничение на размер загружаемого файла — 50 МБ
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "Не удалось прочитать форму: "+err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "Файл не прикреплен")
		return
	}
	defer file.Close()

	caption := strings.TrimSpace(r.FormValue("caption"))
	mediaType := strings.ToLower(strings.TrimSpace(r.FormValue("type")))
	requestedConnID := r.FormValue("connection_id")
	replyToID, _ := strconv.ParseInt(r.FormValue("reply_to_message_id"), 10, 64)

	conn, err := s.resolveConnection(r, chatID, requestedConnID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	filename := header.Filename
	if filename == "" {
		filename = "file"
	}

	// Автоопределение типа медиа, если не передан явно
	if mediaType == "" {
		ext := strings.ToLower(filepath.Ext(filename))
		switch ext {
		case ".jpg", ".jpeg", ".png", ".webp":
			mediaType = "photo"
		case ".gif":
			mediaType = "animation"
		case ".mp4", ".mov", ".avi", ".mkv":
			mediaType = "video"
		case ".ogg", ".oga", ".m4a", ".mp3", ".wav":
			mediaType = "voice"
		default:
			mediaType = "document"
		}
	}

	inputFile := &models.InputFileUpload{
		Filename: filename,
		Data:     file,
	}

	var replyParams *models.ReplyParameters
	if replyToID > 0 {
		replyParams = &models.ReplyParameters{
			MessageID: int(replyToID),
		}
	}

	var msg *models.Message
	switch mediaType {
	case "photo":
		msg, err = s.bot.SendPhoto(r.Context(), &bot.SendPhotoParams{
			BusinessConnectionID: conn.ID,
			ChatID:               chatID,
			Photo:                inputFile,
			Caption:              caption,
			ReplyParameters:      replyParams,
		})
	case "voice":
		msg, err = s.bot.SendVoice(r.Context(), &bot.SendVoiceParams{
			BusinessConnectionID: conn.ID,
			ChatID:               chatID,
			Voice:                inputFile,
			Caption:              caption,
			ReplyParameters:      replyParams,
		})
	case "video":
		msg, err = s.bot.SendVideo(r.Context(), &bot.SendVideoParams{
			BusinessConnectionID: conn.ID,
			ChatID:               chatID,
			Video:                inputFile,
			Caption:              caption,
			ReplyParameters:      replyParams,
		})
	case "animation":
		msg, err = s.bot.SendAnimation(r.Context(), &bot.SendAnimationParams{
			BusinessConnectionID: conn.ID,
			ChatID:               chatID,
			Animation:            inputFile,
			Caption:              caption,
			ReplyParameters:      replyParams,
		})
	default:
		msg, err = s.bot.SendDocument(r.Context(), &bot.SendDocumentParams{
			BusinessConnectionID: conn.ID,
			ChatID:               chatID,
			Document:             inputFile,
			Caption:              caption,
			ReplyParameters:      replyParams,
		})
	}

	if err != nil {
		s.log.Error("send media error", "chat_id", chatID, "type", mediaType, "err", err)
		writeError(w, http.StatusBadRequest, "Ошибка отправки файла в Telegram: "+err.Error())
		return
	}

	owner, partner := s.vault.GetChatParticipants(r.Context(), chatID)
	if conn.UserName != nil && *conn.UserName != "" {
		owner = *conn.UserName
	}

	kind, fileID := extractMediaFromMessage(msg)
	if kind == "" {
		kind = mediaType
	}
	text := extractTextFromMessage(msg)
	if text == "" {
		text = caption
	}

	in := service.IncomingMessage{
		ConnectionID:  conn.ID,
		ChatID:        chatID,
		MessageID:     int64(msg.ID),
		SenderID:      conn.UserID,
		SenderName:    owner,
		RecipientName: partner,
		IsOutgoing:    true,
		Text:          text,
		MediaType:     kind,
		FileID:        fileID,
		SentAt:        time.Unix(int64(msg.Date), 0),
	}

	mv, err := s.vault.SaveMessage(r.Context(), in)
	if err != nil {
		s.log.Error("save sent media message error", "chat_id", chatID, "err", err)
		writeError(w, http.StatusInternalServerError, "Файл отправлен, но не удалось сохранить в базу")
		return
	}

	if s.hub != nil {
		s.hub.Broadcast("message_created", map[string]any{
			"connection_id": conn.ID,
			"chat_id":       chatID,
			"message":       mv,
		})
	}

	writeJSON(w, http.StatusOK, mv)
}

// DELETE /api/chats/{chatId}/messages/{messageId} — удаление сообщения в Telegram (для всех) и в базе.
func (s *Server) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	chatID, err := strconv.ParseInt(r.PathValue("chatId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный chatId")
		return
	}

	msgID, err := strconv.ParseInt(r.PathValue("messageId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный messageId")
		return
	}

	requestedConnID := r.URL.Query().Get("connection_id")
	conn, err := s.resolveConnection(r, chatID, requestedConnID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// 1. Вызываем удаление сообщения в Telegram на стороне бизнес-аккаунта
	ok, err := s.bot.DeleteBusinessMessages(r.Context(), &bot.DeleteBusinessMessagesParams{
		BusinessConnectionID: conn.ID,
		MessageIDs:           []int{int(msgID)},
	})
	if err != nil {
		s.log.Error("delete business message error", "chat_id", chatID, "msg_id", msgID, "err", err)
		writeError(w, http.StatusBadRequest, "Ошибка удаления в Telegram: "+err.Error())
		return
	}

	// 2. Помечаем сообщение как удалённое в базе данных
	if err := s.vault.MarkDeleted(r.Context(), conn.ID, chatID, msgID); err != nil {
		s.log.Error("mark message deleted error", "chat_id", chatID, "msg_id", msgID, "err", err)
	}

	// 3. Рассылаем WebSocket событие обновления клиентам веб-панели
	if s.hub != nil {
		s.hub.Broadcast("messages_deleted", map[string]any{
			"connection_id": conn.ID,
			"chat_id":       chatID,
			"message_ids":   []int64{msgID},
			"deleted_at":    time.Now().UTC(),
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         ok,
		"deleted_id": msgID,
	})
}

func extractMediaFromMessage(m *models.Message) (kind string, fileID string) {
	if m == nil {
		return "", ""
	}
	switch {
	case len(m.Photo) > 0:
		return "photo", m.Photo[len(m.Photo)-1].FileID
	case m.Video != nil:
		return "video", m.Video.FileID
	case m.Voice != nil:
		return "voice", m.Voice.FileID
	case m.VideoNote != nil:
		return "video_note", m.VideoNote.FileID
	case m.Animation != nil:
		return "animation", m.Animation.FileID
	case m.Document != nil:
		return "document", m.Document.FileID
	case m.Audio != nil:
		return "audio", m.Audio.FileID
	case m.Sticker != nil:
		return "sticker", m.Sticker.FileID
	}
	return "", ""
}

func extractTextFromMessage(m *models.Message) string {
	if m == nil {
		return ""
	}
	if m.Text != "" {
		return m.Text
	}
	return m.Caption
}
