package jellyfin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestConfiguredPlaybackUser(t *testing.T) {
	users := []any{
		map[string]any{"Id": "admin-id", "Name": "admin", "Policy": map[string]any{"IsAdministrator": true}},
		map[string]any{"Id": "viewer-id", "Name": "viewer", "Policy": map[string]any{}},
		map[string]any{"Id": "disabled-id", "Name": "disabled", "Policy": map[string]any{"IsDisabled": true}},
	}
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/Users" || r.Header.Get("X-Emby-Token") != "secret" {
			t.Error("invalid user lookup")
		}
		json.NewEncoder(w).Encode(users)
	}))
	defer server.Close()
	username := "viewer"
	backend := &Backend{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.jellyfin.url": server.URL, "api.jellyfin.token": "secret", "api.jellyfin.username": username}, nil
	}}
	ctx := context.Background()
	if id, err := backend.UserID(ctx); err != nil || id != "viewer-id" {
		t.Fatalf("must use configured ordinary user: %q %v", id, err)
	}
	if _, err := backend.UserID(ctx); err != nil || requests != 1 {
		t.Fatal("expected short user cache", err)
	}
	for _, name := range []string{"", "missing", "disabled", "Viewer"} {
		username = name
		if id, err := backend.UserID(ctx); err == nil || id != "" {
			t.Fatalf("must reject %q without fallback: %q %v", name, id, err)
		}
	}
	username = "admin"
	if id, err := backend.UserID(ctx); err != nil || id != "admin-id" {
		t.Fatalf("configuration change must apply immediately: %q %v", id, err)
	}
	users[0].(map[string]any)["Policy"] = map[string]any{"IsDisabled": true}
	backend.userAt = time.Now().Add(-2 * time.Minute)
	if _, err := backend.UserID(ctx); err == nil {
		t.Fatal("disabled user must fail after cache expiry")
	}
}
