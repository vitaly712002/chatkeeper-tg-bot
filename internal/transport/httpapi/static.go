package httpapi

import (
	"net/http"
	"os"
	"path/filepath"
)

// staticHandler отдаёт собранную веб-панель (SPA) из папки dir.
//
// Логика «single page application»: если запрошенный путь — реальный файл
// (например, /assets/index-abc.js), отдаём его; иначе отдаём index.html,
// чтобы работал клиентский роутинг React. Запросы к /api/* сюда не попадают —
// они перехватываются более конкретными маршрутами в ServeMux.
func staticHandler(dir string) http.Handler {
	fileServer := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// filepath.Clean + корень защищают от выхода за пределы dir (path traversal).
		path := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	})
}
