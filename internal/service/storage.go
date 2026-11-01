package service

import (
	"math"
	"os"
)

// StorageInfo — сводка о свободном и занятом месте на диске для веб-панели.
type StorageInfo struct {
	TotalBytes  uint64  `json:"total_bytes"`
	FreeBytes   uint64  `json:"free_bytes"`
	UsedBytes   uint64  `json:"used_bytes"`
	UsedPercent float64 `json:"used_percent"`
	Path        string  `json:"path"`
}

// GetStorageInfo определяет дисковое пространство для директории сохранения файлов.
func GetStorageInfo(dir string) StorageInfo {
	target := dir
	if target == "" {
		target = "."
	}
	for target != "" && target != "." && target != "/" {
		if _, err := os.Stat(target); err == nil {
			break
		}
		target = parentDir(target)
	}
	if target == "" {
		target = "."
	}

	ds, err := getDiskSpace(target)
	if err != nil {
		ds, _ = getDiskSpace(".")
	}

	var pct float64
	if ds.TotalBytes > 0 {
		pct = float64(ds.UsedBytes) / float64(ds.TotalBytes) * 100
	}

	return StorageInfo{
		TotalBytes:  ds.TotalBytes,
		FreeBytes:   ds.FreeBytes,
		UsedBytes:   ds.UsedBytes,
		UsedPercent: math.Round(pct*10) / 10,
		Path:        target,
	}
}

func parentDir(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' || p[i] == '\\' {
			if i == 0 {
				return "/"
			}
			return p[:i]
		}
	}
	return "."
}
