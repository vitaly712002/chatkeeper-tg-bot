package httpapi

import (
	"net/http"
	"strings"
)

// auth — middleware, пропускающий запрос дальше только с валидным JWT.
// Токен берётся из заголовка "Authorization: Bearer <token>", а для медиа —
// из query-параметра ?t=<token> (теги <img>/<video> не умеют слать заголовки).
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r)
		if token == "" {
			token = r.URL.Query().Get("t")
		}
		if !s.verifyToken(token) {
			writeError(w, http.StatusUnauthorized, "Требуется авторизация")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// bearerToken вытаскивает токен из заголовка Authorization.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if strings.HasPrefix(h, prefix) {
		return strings.TrimSpace(h[len(prefix):])
	}
	return ""
}
