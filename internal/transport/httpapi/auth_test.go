package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vitaly/chatkeeper-tg-bot/internal/config"
)

func testServer() *Server {
	return &Server{
		cfg: config.Config{
			AdminUser:     "admin",
			AdminPassword: "s3cret",
			JWTSecret:     "test-secret-key",
			JWTTTL:        3600_000_000_000, // 1h в наносекундах
		},
		log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

// TestIssueVerifyRoundTrip: выпущенный токен должен проходить проверку.
func TestIssueVerifyRoundTrip(t *testing.T) {
	s := testServer()
	tok, err := s.issueToken("admin")
	if err != nil {
		t.Fatalf("issueToken: %v", err)
	}
	if !s.verifyToken(tok) {
		t.Error("свежий токен не прошёл проверку")
	}
}

// TestVerifyRejectsWrongSecret: токен, подписанный другим секретом, отклоняется.
func TestVerifyRejectsWrongSecret(t *testing.T) {
	s1 := testServer()
	tok, _ := s1.issueToken("admin")

	s2 := testServer()
	s2.cfg.JWTSecret = "другой-секрет"
	if s2.verifyToken(tok) {
		t.Error("токен с чужим секретом не должен проходить проверку")
	}
}

// TestVerifyRejectsGarbage: мусор вместо токена отклоняется.
func TestVerifyRejectsGarbage(t *testing.T) {
	s := testServer()
	if s.verifyToken("not-a-token") || s.verifyToken("") {
		t.Error("невалидный токен не должен проходить проверку")
	}
}

// TestLoginFlow: верные данные -> 200 и токен; неверные -> 401.
func TestLoginFlow(t *testing.T) {
	s := testServer()

	ok := httptest.NewRecorder()
	s.handleLogin(ok, httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(`{"username":"admin","password":"s3cret"}`)))
	if ok.Code != http.StatusOK {
		t.Fatalf("ожидали 200, получили %d", ok.Code)
	}
	if !strings.Contains(ok.Body.String(), "token") {
		t.Error("в ответе нет токена")
	}

	bad := httptest.NewRecorder()
	s.handleLogin(bad, httptest.NewRequest(http.MethodPost, "/api/auth/login",
		strings.NewReader(`{"username":"admin","password":"wrong"}`)))
	if bad.Code != http.StatusUnauthorized {
		t.Errorf("ожидали 401 для неверного пароля, получили %d", bad.Code)
	}
}

// TestAuthMiddleware: без токена -> 401, с токеном в заголовке и в query -> 200.
func TestAuthMiddleware(t *testing.T) {
	s := testServer()
	protected := s.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	tok, _ := s.issueToken("admin")

	// Без токена.
	w := httptest.NewRecorder()
	protected.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/stats", nil))
	if w.Code != http.StatusUnauthorized {
		t.Errorf("без токена ожидали 401, получили %d", w.Code)
	}

	// Токен в заголовке.
	w = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/stats", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	protected.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("с заголовком ожидали 200, получили %d", w.Code)
	}

	// Токен в query (для медиа).
	w = httptest.NewRecorder()
	protected.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/media/x?t="+tok, nil))
	if w.Code != http.StatusOK {
		t.Errorf("с query-токеном ожидали 200, получили %d", w.Code)
	}
}
