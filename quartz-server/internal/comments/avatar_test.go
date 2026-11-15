package comments

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAvatarHashMappingIsCachedAndContainsNoEmails(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/auth/email/login" {
			json.NewEncoder(w).Encode(map[string]any{"token": "private"})
			return
		}
		if r.URL.Path != "/api/v2/users/all" || r.Header.Get("Authorization") != "Bearer private" {
			t.Error("unexpected or unauthenticated avatar lookup")
		}
		calls++
		json.NewEncoder(w).Encode(map[string]any{"count": 1, "users": []any{map[string]any{"email": " Visitor@Example.test ", "name": "Visitor"}}})
	}))
	defer upstream.Close()
	a := &Service{Client: &Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": upstream.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "secret"}, nil
	}}}
	sha := sha256.Sum256([]byte("visitor@example.test"))
	md := md5.Sum([]byte("visitor@example.test"))
	expected := hex.EncodeToString(md[:])
	for range 2 {
		value, err := a.AvatarHash(context.Background(), strings.ToUpper(hex.EncodeToString(sha[:])))
		if err != nil || value != expected {
			t.Fatal(value, err)
		}
	}
	if calls != 1 {
		t.Fatal("mapping not cached", calls)
	}
	if value, err := a.AvatarHash(context.Background(), strings.Repeat("0", 64)); err != nil || value != "" {
		t.Fatal("unknown hash resolved", value, err)
	}
	if _, err := a.AvatarHash(context.Background(), "visitor@example.test"); err == nil {
		t.Fatal("raw email accepted")
	}
	if value, err := a.AvatarHash(context.Background(), expected); err != nil || value != expected {
		t.Fatal(value, err)
	}
	if calls != 1 {
		t.Fatal("unknown or MD5 hashes bypassed cache")
	}
}
