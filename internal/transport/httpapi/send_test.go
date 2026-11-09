package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSendMessageValidation(t *testing.T) {
	s := testServer()
	token, err := s.issueToken("admin")
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("POST /api/chats/{chatId}/messages", s.auth(http.HandlerFunc(s.handleSendMessage)))

	// 1. Без токена авторизации -> 401
	{
		req := httptest.NewRequest(http.MethodPost, "/api/chats/123/messages", bytes.NewBufferString(`{"text":"hello"}`))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("ожидался 401, получен %d", w.Code)
		}
	}

	// 2. С валидным токеном, но пустой текст -> 400
	{
		body, _ := json.Marshal(SendMessageRequest{Text: "   "})
		req := httptest.NewRequest(http.MethodPost, "/api/chats/123/messages", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("ожидался 400 для пустого текста, получен %d", w.Code)
		}
	}

	// 3. Некорректный chatId -> 400
	{
		body, _ := json.Marshal(SendMessageRequest{Text: "Привет"})
		req := httptest.NewRequest(http.MethodPost, "/api/chats/abc/messages", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("ожидался 400 для некорректного chatId, получен %d", w.Code)
		}
	}
}

func TestDeleteMessageValidation(t *testing.T) {
	s := testServer()
	token, err := s.issueToken("admin")
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("DELETE /api/chats/{chatId}/messages/{messageId}", s.auth(http.HandlerFunc(s.handleDeleteMessage)))

	// Без токена -> 401
	req := httptest.NewRequest(http.MethodDelete, "/api/chats/123/messages/456", nil)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("ожидался 401, получен %d", w.Code)
	}

	// Некорректный messageId -> 400
	req2 := httptest.NewRequest(http.MethodDelete, "/api/chats/123/messages/notanumber", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	mux.ServeHTTP(w2, req2)
	if w2.Code != http.StatusBadRequest {
		t.Errorf("ожидался 400, получен %d", w2.Code)
	}
}

func TestForwardMessageValidation(t *testing.T) {
	s := testServer()
	token, err := s.issueToken("admin")
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("POST /api/messages/{id}/forward", s.auth(http.HandlerFunc(s.handleForwardMessage)))

	// 1. Без токена -> 401
	{
		req := httptest.NewRequest(http.MethodPost, "/api/messages/123/forward", bytes.NewBufferString(`{"target_chat_id":456}`))
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("ожидался 401, получен %d", w.Code)
		}
	}

	// 2. Некорректный id сообщения -> 400
	{
		req := httptest.NewRequest(http.MethodPost, "/api/messages/invalid/forward", bytes.NewBufferString(`{"target_chat_id":456}`))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("ожидался 400, получен %d", w.Code)
		}
	}

	// 3. Отсутствует target_chat_id -> 400
	{
		req := httptest.NewRequest(http.MethodPost, "/api/messages/123/forward", bytes.NewBufferString(`{"target_chat_id":0}`))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("ожидался 400, получен %d", w.Code)
		}
	}
}

func TestMarkChatReadValidation(t *testing.T) {
	s := testServer()
	token, err := s.issueToken("admin")
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("POST /api/chats/{chatId}/read", s.auth(http.HandlerFunc(s.handleMarkChatRead)))

	// 1. Без токена -> 401
	{
		req := httptest.NewRequest(http.MethodPost, "/api/chats/123/read", nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("ожидался 401, получен %d", w.Code)
		}
	}

	// 2. Некорректный chatId -> 400
	{
		req := httptest.NewRequest(http.MethodPost, "/api/chats/notanumber/read", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("ожидался 400, получен %d", w.Code)
		}
	}
}

func TestCleanHistoryValidation(t *testing.T) {
	s := testServer()
	token, err := s.issueToken("admin")
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("POST /api/history/clean", s.auth(http.HandlerFunc(s.handleCleanHistory)))

	// 1. Без токена -> 401
	{
		req := httptest.NewRequest(http.MethodPost, "/api/history/clean", nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("ожидался 401, получен %d", w.Code)
		}
	}

	// 2. С токеном -> 200
	{
		req := httptest.NewRequest(http.MethodPost, "/api/history/clean", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("ожидался 200, получен %d", w.Code)
		}
		var resp map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("ошибка разбора JSON ответа: %v", err)
		}
		if _, ok := resp["deleted_messages"]; !ok {
			t.Errorf("в ответе отсутствует поле deleted_messages")
		}
	}
}
