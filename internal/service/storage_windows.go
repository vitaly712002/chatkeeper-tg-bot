//go:build windows

package service

import (
	"syscall"
	"unsafe"
)

type diskSpace struct {
	TotalBytes uint64
	FreeBytes  uint64
	UsedBytes  uint64
}

func getDiskSpace(path string) (diskSpace, error) {
	ptr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return diskSpace{}, err
	}
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	proc := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes uint64
	r1, _, errCall := proc.Call(
		uintptr(unsafe.Pointer(ptr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if r1 == 0 {
		return diskSpace{}, errCall
	}
	used := uint64(0)
	if totalNumberOfBytes > freeBytesAvailable {
		used = totalNumberOfBytes - freeBytesAvailable
	}
	return diskSpace{
		TotalBytes: totalNumberOfBytes,
		FreeBytes:  freeBytesAvailable,
		UsedBytes:  used,
	}, nil
}
