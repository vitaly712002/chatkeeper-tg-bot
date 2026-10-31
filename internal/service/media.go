package service

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// MediaStore отвечает за сохранение перехваченных медиафайлов на диск.
// Он намеренно ничего не знает про Telegram — ему дают готовые байты и тип,
// а он кладёт их в файл и возвращает путь. Скачиванием из Telegram занимается
// транспортный слой.
type MediaStore struct {
	dir string
}

// NewMediaStore создаёт хранилище и гарантирует, что папка существует.
func NewMediaStore(dir string) (*MediaStore, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("не удалось создать папку для медиа %q: %w", dir, err)
	}
	return &MediaStore{dir: dir}, nil
}

// Save записывает байты в файл с уникальным именем и возвращает путь к нему.
// ext — расширение без точки (например "jpg", "mp4"); может быть пустым.
func (m *MediaStore) Save(data []byte, ext string) (string, error) {
	name := fmt.Sprintf("%d_%d", time.Now().UnixNano(), len(data))
	if ext != "" {
		name += "." + ext
	}
	path := filepath.Join(m.dir, name)

	if err := os.WriteFile(path, data, 0o640); err != nil {
		return "", fmt.Errorf("не удалось сохранить медиа: %w", err)
	}
	return path, nil
}
