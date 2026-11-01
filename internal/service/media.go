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

// CleanAll удаляет все сохранённые медиафайлы из папки и возвращает
// количество удалённых файлов и суммарный освобождённый размер в байтах.
func (m *MediaStore) CleanAll() (int, int64, error) {
	if m == nil || m.dir == "" {
		return 0, 0, nil
	}
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, 0, nil
		}
		return 0, 0, fmt.Errorf("чтение папки медиа %q: %w", m.dir, err)
	}

	var deletedCount int
	var freedBytes int64

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(m.dir, entry.Name())
		if info, err := entry.Info(); err == nil {
			freedBytes += info.Size()
		}
		if err := os.Remove(path); err == nil {
			deletedCount++
		}
	}

	return deletedCount, freedBytes, nil
}

// Stats возвращает количество сохранённых медиафайлов и их суммарный объём в байтах.
func (m *MediaStore) Stats() (int, int64) {
	if m == nil || m.dir == "" {
		return 0, 0
	}
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return 0, 0
	}

	var count int
	var totalBytes int64

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if info, err := entry.Info(); err == nil {
			count++
			totalBytes += info.Size()
		}
	}

	return count, totalBytes
}
