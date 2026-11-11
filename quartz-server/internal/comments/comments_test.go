package comments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestPublicCommentVisibilityOriginAndDate(t *testing.T) {
	item := map[string]any{"id": float64(1), "is_pending": false, "visible": true, "nick": "Visitor", "email_encrypted": strings.Repeat("A", 32), "content_marked": "<b>message</b>", "date": "2026-11-10 08:00:00", "rid": float64(0)}
	page := Page{Slug: "Memo/note", Title: "笔记"}
	value := PublicComment(item, page, "https://goblincwl.site", map[string]any{"mirror": "https://avatar.example/avatar", "params": "d=identicon"})
	if value["createdAt"] != "2026-11-10T00:00:00.000Z" || value["avatarSeed"] != strings.Repeat("a", 32) || value["url"] != "https://goblincwl.site/Memo/note#atk-comment-1" {
		t.Fatal(value)
	}
	page.PublicPath = "https://evil.example/"
	if PublicComment(item, page, "https://goblincwl.site", nil) != nil {
		t.Fatal("external link published")
	}
	page.PublicPath = ""
	item["is_pending"] = true
	if PublicComment(item, page, "https://goblincwl.site", nil) != nil {
		t.Fatal("pending comment exposed")
	}
}
func TestClient401RetryAndConfigurationChange(t *testing.T) {
	var logins, reads atomic.Int32
	password := "first"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/auth/email/login" {
			var input map[string]any
			json.NewDecoder(r.Body).Decode(&input)
			logins.Add(1)
			json.NewEncoder(w).Encode(map[string]any{"token": input["password"]})
			return
		}
		if reads.Add(1) == 1 {
			w.WriteHeader(401)
			return
		}
		if r.Header.Get("Authorization") != "Bearer "+password {
			t.Error("stale credential used")
		}
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer server.Close()
	client := Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": password}, nil
	}}
	if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err != nil {
		t.Fatal(err)
	}
	if logins.Load() != 2 {
		t.Fatal("401 was not retried once")
	}
	password = "second"
	if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err != nil {
		t.Fatal(err)
	}
	if logins.Load() != 3 {
		t.Fatal("changed password did not invalidate token")
	}
}
