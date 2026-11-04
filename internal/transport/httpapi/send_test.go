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
