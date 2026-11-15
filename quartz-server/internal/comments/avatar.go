package comments

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Artalk exposes SHA-256, while Cravatar requires MD5. Keep email addresses
// inside the authenticated backend; only resolve hashes of existing users.
func (a *Archive) AvatarHash(ctx context.Context, hash string) (string, error) {
	hash = strings.ToLower(hash)
	if !emailHash.MatchString(hash) {
		return "", errors.New("头像哈希无效")
	}
	if len(hash) == 32 {
		return hash, nil
	}
	values, err := a.Cache.Get(ctx, "avatar-hashes", 5*time.Minute, false, func(ctx context.Context) (map[string]any, error) {
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		result := map[string]any{}
		const chunk = 100
		for offset := 0; offset < 10000; offset += chunk {
			data, err := a.Client.Do(ctx, fmt.Sprintf("/api/v2/users/all?limit=%d&offset=%d", chunk, offset), true, "GET", nil)
			if err != nil {
				return nil, err
			}
			rows := list(data["users"])
			for _, entry := range rows {
				email := strings.ToLower(strings.TrimSpace(text(object(entry)["email"])))
				if email == "" {
					continue
				}
				sha := sha256.Sum256([]byte(email))
				md := md5.Sum([]byte(email))
				result[hex.EncodeToString(sha[:])] = hex.EncodeToString(md[:])
			}
			total, ok := integer(data["count"])
			if len(rows) < chunk || ok && int64(offset+len(rows)) >= total {
				break
			}
		}
		return result, nil
	})
	if err != nil {
		return "", err
	}
	return text(values[hash]), nil
}
