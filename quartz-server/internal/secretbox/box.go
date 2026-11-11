package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
)

type Envelope struct {
	IV         string `json:"iv"`
	Tag        string `json:"tag"`
	Ciphertext string `json:"ciphertext"`
}

func Seal(plain string, key, aad []byte) (Envelope, error) {
	var result Envelope
	block, err := aes.NewCipher(key)
	if err != nil {
		return result, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return result, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return result, err
	}
	data := gcm.Seal(nil, nonce, []byte(plain), aad)
	return Envelope{hex.EncodeToString(nonce), hex.EncodeToString(data[len(data)-gcm.Overhead():]), hex.EncodeToString(data[:len(data)-gcm.Overhead()])}, nil
}
func Open(envelope Envelope, key, aad []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv, err := hex.DecodeString(envelope.IV)
	if err != nil {
		return "", err
	}
	tag, err := hex.DecodeString(envelope.Tag)
	if err != nil {
		return "", err
	}
	data, err := hex.DecodeString(envelope.Ciphertext)
	if err != nil {
		return "", err
	}
	if len(iv) != gcm.NonceSize() || len(tag) != gcm.Overhead() {
		return "", errors.New("invalid encrypted envelope")
	}
	plain, err := gcm.Open(nil, iv, append(data, tag...), aad)
	return string(plain), err
}
