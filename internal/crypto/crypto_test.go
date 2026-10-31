package crypto

import (
	"bytes"
	"crypto/rand"
	"testing"
)

// newTestCipher создаёт Cipher со случайным ключом для тестов.
func newTestCipher(t *testing.T) *Cipher {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("не удалось сгенерировать ключ: %v", err)
	}
	c, err := New(key)
	if err != nil {
		t.Fatalf("New вернул ошибку: %v", err)
	}
	return c
}

// TestEncryptDecryptRoundTrip проверяет главное свойство: что зашифровали,
// то и расшифровали обратно без потерь.
func TestEncryptDecryptRoundTrip(t *testing.T) {
	c := newTestCipher(t)

	cases := []string{
		"",
		"привет",
		"Hello, World!",
		"сообщение с эмодзи 🔐📸 и переносом\nстроки",
	}

	for _, want := range cases {
		enc, err := c.EncryptString(want)
		if err != nil {
			t.Fatalf("EncryptString(%q): %v", want, err)
		}
		got, err := c.DecryptString(enc)
		if err != nil {
			t.Fatalf("DecryptString: %v", err)
		}
		if got != want {
			t.Errorf("round-trip: получили %q, ожидали %q", got, want)
		}
	}
}

// TestEncryptIsRandomized проверяет, что одинаковый текст даёт разный
// шифротекст (благодаря случайному nonce). Это важное свойство безопасности.
func TestEncryptIsRandomized(t *testing.T) {
	c := newTestCipher(t)

	a, err := c.EncryptString("одинаковый текст")
	if err != nil {
		t.Fatal(err)
	}
	b, err := c.EncryptString("одинаковый текст")
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(a, b) {
		t.Error("два шифрования одного текста совпали — nonce не случайный")
	}
}

// TestDecryptWithWrongKeyFails проверяет, что чужим ключом расшифровать нельзя.
func TestDecryptWithWrongKeyFails(t *testing.T) {
	c1 := newTestCipher(t)
	c2 := newTestCipher(t)

	enc, err := c1.EncryptString("секрет")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c2.DecryptString(enc); err == nil {
		t.Error("ожидали ошибку при расшифровке чужим ключом, но её нет")
	}
}

// TestDecryptTamperedFails проверяет, что изменённый шифротекст не расшифруется
// (GCM ловит подделку).
func TestDecryptTamperedFails(t *testing.T) {
	c := newTestCipher(t)

	enc, err := c.EncryptString("целостность важна")
	if err != nil {
		t.Fatal(err)
	}
	enc[len(enc)-1] ^= 0xFF // портим последний байт

	if _, err := c.Decrypt(enc); err == nil {
		t.Error("ожидали ошибку при расшифровке подделанных данных, но её нет")
	}
}

// TestNewRejectsBadKeyLength проверяет валидацию длины ключа.
func TestNewRejectsBadKeyLength(t *testing.T) {
	if _, err := New(make([]byte, 16)); err == nil {
		t.Error("ожидали ошибку для ключа длиной 16 байт")
	}
}
