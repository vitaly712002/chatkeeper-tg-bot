package httpapi

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// loginRequest — тело запроса на вход.
type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// handleLogin проверяет логин/пароль и выдаёт JWT-токен.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Некорректный запрос")
		return
	}

	// Сравниваем в постоянное время (защита от timing-атак).
	userOK := subtle.ConstantTimeCompare([]byte(req.Username), []byte(s.cfg.AdminUser)) == 1
	passOK := subtle.ConstantTimeCompare([]byte(req.Password), []byte(s.cfg.AdminPassword)) == 1
	if !userOK || !passOK {
		writeError(w, http.StatusUnauthorized, "Неверный логин или пароль")
		return
	}

	token, err := s.issueToken(req.Username)
	if err != nil {
		s.log.Error("не удалось выпустить токен", "err", err)
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  map[string]string{"username": req.Username},
	})
}

// issueToken создаёт подписанный JWT со сроком жизни из конфига.
func (s *Server) issueToken(username string) (string, error) {
	claims := jwt.RegisteredClaims{
		Subject:   username,
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.cfg.JWTTTL)),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(s.cfg.JWTSecret))
}

// verifyToken проверяет подпись и срок действия токена.
func (s *Server) verifyToken(tokenStr string) bool {
	if tokenStr == "" {
		return false
	}
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
		// Принимаем только HMAC — защита от подмены алгоритма (alg=none и т.п.).
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	return err == nil && tok.Valid
}
