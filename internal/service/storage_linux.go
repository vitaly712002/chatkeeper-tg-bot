//go:build !windows

package service

import (
	"syscall"
)

type diskSpace struct {
	TotalBytes uint64
	FreeBytes  uint64
	UsedBytes  uint64
}

func getDiskSpace(path string) (diskSpace, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return diskSpace{}, err
	}
	total := stat.Blocks * uint64(stat.Bsize)
	free := stat.Bavail * uint64(stat.Bsize)
	used := uint64(0)
	if total > free {
		used = total - free
	}
	return diskSpace{
		TotalBytes: total,
		FreeBytes:  free,
		UsedBytes:  used,
	}, nil
}
