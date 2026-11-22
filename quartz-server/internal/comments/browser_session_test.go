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
				if r.URL.Path == "/api/v2/user/access_token" {
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

func TestBrowserSessionRefreshesExpiredTokenDespitePublicAdminProfile(t *testing.T) {
	logins := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/user/access_token":
			logins++
			json.NewEncoder(w).Encode(map[string]any{"token": "fresh-browser"})
		case "/api/v2/pages":
			if r.Header.Get("Authorization") != "Bearer fresh-browser" {
				w.WriteHeader(403)
				w.Write([]byte(`{"data":{"need_login":true}}`))
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"pages": []any{}})
		case "/api/v2/user":
			json.NewEncoder(w).Encode(map[string]any{"user": map[string]any{"name": "Admin", "email": "admin@example.test", "is_admin": true}})
		default:
			t.Error("unexpected route", r.URL.Path)
		}
	}))
	defer server.Close()
	sessions := &SessionStore{}
	client := Client{Sessions: sessions, Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "password"}, nil
	}}
	_, _, key, _ := client.configuration(context.Background())
	sessions.load()
	sessions.state.Sessions["browser"] = cachedSession{key, "expired-browser"}
	result, err := client.BrowserSession(context.Background())
	if err != nil || result["token"] != "fresh-browser" || logins != 1 {
		t.Fatalf("browser token was not refreshed: err=%v logins=%d", err, logins)
	}
}
