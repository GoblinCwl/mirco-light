package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"goblincwl/quartz-server/internal/secretbox"
	"strconv"
	"strings"
)

type Sealed = secretbox.Envelope

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func digest(value string) string { s := sha256.Sum256([]byte(value)); return hex.EncodeToString(s[:]) }
func secureEqual(a, b string) bool {
	return len(a) == len(b) && subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
func secret() (string, error) {
	b := make([]byte, 20)
	_, err := rand.Read(b)
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b), err
}
func totp(secret string, counter int64) (string, error) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return "", err
	}
	var b [8]byte
	binary.BigEndian.PutUint64(b[:], uint64(counter))
	mac := hmac.New(sha1.New, key)
	mac.Write(b[:])
	hash := mac.Sum(nil)
	offset := hash[len(hash)-1] & 15
	number := binary.BigEndian.Uint32(hash[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", number%1000000), nil
}
func match(secret, code string, seconds, last int64) (int64, error) {
	if len(code) != 6 {
		return -1, nil
	}
	if _, err := strconv.ParseUint(code, 10, 32); err != nil {
		return -1, nil
	}
	current := seconds / 30
	for _, counter := range []int64{current, current - 1, current + 1} {
		if counter < 0 || counter <= last {
			continue
		}
		expected, err := totp(secret, counter)
		if err != nil {
			return -1, err
		}
		if secureEqual(expected, code) {
			return counter, nil
		}
	}
	return -1, nil
}
func normalizeRecovery(code string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
}
func seal(secret string, key []byte) (Sealed, error) { return secretbox.Seal(secret, key, nil) }
func open(value Sealed, key []byte) (string, error)  { return secretbox.Open(value, key, nil) }
