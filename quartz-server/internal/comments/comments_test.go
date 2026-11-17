package comments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestClient401RetryAndConfigurationChange(t *testing.T) {
	var logins, reads atomic.Int32
	password := "first"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/user/access_token" {
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
