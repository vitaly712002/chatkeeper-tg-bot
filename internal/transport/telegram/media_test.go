package telegram

import (
	"testing"

	"github.com/go-telegram/bot/models"
)

func TestIsDisappearingMedia(t *testing.T) {
	tests := []struct {
		name     string
		msg      *models.Message
		expected bool
	}{
		{
			name:     "nil message",
			msg:      nil,
			expected: false,
		},
		{
			name: "regular text message",
			msg: &models.Message{
				Text: "hello",
			},
			expected: false,
		},
		{
			name: "protected text message (not media)",
			msg: &models.Message{
				Text:                "secret text",
				HasProtectedContent: true,
			},
			expected: false,
		},
		{
			name: "regular photo without protected content",
			msg: &models.Message{
				Photo: []models.PhotoSize{{FileID: "photo123"}},
			},
			expected: false,
		},
		{
			name: "disappearing photo (has protected content)",
			msg: &models.Message{
				Photo:               []models.PhotoSize{{FileID: "photo123"}},
				HasProtectedContent: true,
			},
			expected: true,
		},
		{
			name: "disappearing video (has protected content)",
			msg: &models.Message{
				Video:               &models.Video{FileID: "video123"},
				HasProtectedContent: true,
			},
			expected: true,
		},
		{
			name: "disappearing voice (has protected content)",
			msg: &models.Message{
				Voice:               &models.Voice{FileID: "voice123"},
				HasProtectedContent: true,
			},
			expected: true,
		},
		{
			name: "disappearing video note / round video (has protected content)",
			msg: &models.Message{
				VideoNote:           &models.VideoNote{FileID: "videonote123"},
				HasProtectedContent: true,
			},
			expected: true,
		},
		{
			name: "regular video note / round video (not protected)",
			msg: &models.Message{
				VideoNote:           &models.VideoNote{FileID: "videonote123"},
				HasProtectedContent: false,
			},
			expected: false,
		},
		{
			name: "protected sticker (not disappearing media)",
			msg: &models.Message{
				Sticker:             &models.Sticker{FileID: "sticker123"},
				HasProtectedContent: true,
			},
			expected: false,
		},
		{
			name: "protected document (not disappearing media)",
			msg: &models.Message{
				Document:            &models.Document{FileID: "doc123"},
				HasProtectedContent: true,
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isDisappearingMedia(tt.msg)
			if got != tt.expected {
				t.Errorf("isDisappearingMedia() = %v, expected %v", got, tt.expected)
			}
		})
	}
}

func TestExtractMediaVideoNote(t *testing.T) {
	msg := &models.Message{
		VideoNote: &models.VideoNote{
			FileID:   "vn_abc_123",
			Duration: 15,
			Length:   360,
		},
	}

	media, ok := extractMedia(msg)
	if !ok {
		t.Fatalf("expected extractMedia to return true for VideoNote")
	}
	if media.kind != "video_note" {
		t.Errorf("expected kind 'video_note', got %q", media.kind)
	}
	if media.fileID != "vn_abc_123" {
		t.Errorf("expected fileID 'vn_abc_123', got %q", media.fileID)
	}
	if media.ext != "mp4" {
		t.Errorf("expected ext 'mp4', got %q", media.ext)
	}
}
