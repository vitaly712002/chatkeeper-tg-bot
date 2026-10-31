// Package crypto шифрует и расшифровывает тексты сообщений перед записью
// в базу данных. Используется AES-256 в режиме GCM.
//
// Зачем это нужно: даже если кто-то получит доступ к файлам базы данных
// (например, украдёт бэкап), без ключа шифрования он не прочитает тексты
// переписок. Это называется "шифрование данных в покое" (encryption at rest).
//
// Почему именно AES-256-GCM:
//   - AES-256 — надёжный симметричный шифр (один ключ и шифрует, и расшифровывает).
//   - GCM (Galois/Counter Mode) помимо шифрования ещё и проверяет целостность:
//     если шифротекст подменили хоть на один байт, расшифровка вернёт ошибку.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
)

// Cipher — обёртка вокруг готового к работе AES-GCM.
type Cipher struct {
	aead cipher.AEAD
}

// New создаёт Cipher из 32-байтного ключа (AES-256).
func New(key []byte) (*Cipher, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("ключ должен быть 32 байта, получено %d", len(key))
	}

	// block — низкоуровневый AES-шифр.
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("не удалось создать AES: %w", err)
	}

	// aead добавляет поверх AES режим GCM (шифрование + проверка целостности).
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("не удалось создать GCM: %w", err)
	}

	return &Cipher{aead: aead}, nil
}

// Encrypt шифрует открытый текст и возвращает шифротекст.
//
// Формат результата: [nonce][зашифрованные данные].
// Nonce (number used once) — случайное "одноразовое число". Для каждого
// сообщения он свой, поэтому одинаковый текст даёт разный шифротекст.
// Мы кладём nonce в начало результата, чтобы при расшифровке знать его.
func (c *Cipher) Encrypt(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("не удалось сгенерировать nonce: %w", err)
	}

	// Seal шифрует plaintext и дописывает результат в конец nonce.
	// Первый аргумент (dst=nonce) означает "начни результат с этих байт".
	return c.aead.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt расшифровывает то, что вернул Encrypt.
func (c *Cipher) Decrypt(ciphertext []byte) ([]byte, error) {
	nonceSize := c.aead.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("шифротекст слишком короткий (нет nonce)")
	}

	// Отделяем nonce (начало) от самих зашифрованных данных (остаток).
	nonce, data := ciphertext[:nonceSize], ciphertext[nonceSize:]

	plaintext, err := c.aead.Open(nil, nonce, data, nil)
	if err != nil {
		// Сюда попадём, если ключ не тот или данные повреждены/подделаны.
		return nil, fmt.Errorf("не удалось расшифровать (неверный ключ или повреждённые данные): %w", err)
	}
	return plaintext, nil
}

// EncryptString — удобная обёртка для работы со строками.
func (c *Cipher) EncryptString(s string) ([]byte, error) {
	return c.Encrypt([]byte(s))
}

// DecryptString — удобная обёртка, возвращающая строку.
func (c *Cipher) DecryptString(ciphertext []byte) (string, error) {
	b, err := c.Decrypt(ciphertext)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
