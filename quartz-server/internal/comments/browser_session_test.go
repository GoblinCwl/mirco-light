package comments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBrowserSessionRequiresActualArtalkAdministrator(t *testing.T) {
	for _, admin := range []bool{true, false} {
		t.Run(map[bool]string{true: "administrator", false: "ordinary user"}[admin], func(t *testing.T) {
			logins := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v2/auth/email/login" {
					logins++
					json.NewEncoder(w).Encode(map[string]any{"token": "browser-token"})
					return
				}
				if r.Header.Get("Authorization") != "Bearer browser-token" {
					t.Error("missing browser authentication")
				}
				json.NewEncoder(w).Encode(map[string]any{"user": map[string]any{"name": "Admin", "email": "admin@example.test", "is_admin": admin, "password": "must-not-leak"}})
			}))
			defer server.Close()
			client := Client{Settings: func(context.Context) (map[string]any, error) {
				return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "private-password"}, nil
			}, token: "backend-token", key: "backend-key"}
			value, err := client.BrowserSession(context.Background())
			if !admin {
				if err == nil {
					t.Fatal("ordinary user accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(value)
			if strings.Contains(string(raw), "password") || strings.Contains(string(raw), "backend-token") {
				t.Fatal("private credentials exposed")
			}
			if value["token"] != "browser-token" || client.token != "backend-token" {
				t.Fatal("browser and backend sessions mixed")
			}
			if _, err = client.BrowserSession(context.Background()); err != nil || logins != 1 {
				t.Fatal("browser login was not reused", err, logins)
			}
		})
	}
}
