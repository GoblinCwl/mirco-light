package comments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestPersistentSessionsCoalesceAndKeepBrowserSeparate(t *testing.T) {
	var logins atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/user/access_token" {
			n := logins.Add(1)
			json.NewEncoder(w).Encode(map[string]any{"token": map[int32]string{1: "private-backend-token", 2: "browser-token"}[n]})
			return
		}
		if r.URL.Path == "/pages" && r.Header.Get("Authorization") != "Bearer private-backend-token" {
			t.Error("backend token replaced by browser token")
		}
		json.NewEncoder(w).Encode(map[string]any{"user": map[string]any{"name": "Admin", "email": "admin@example.test", "is_admin": true}})
	}))
	defer server.Close()
	directory := t.TempDir()
	makeClient := func() *Client {
		return &Client{Sessions: &SessionStore{Directory: directory, Key: []byte(strings.Repeat("k", 32))}, Settings: func(context.Context) (map[string]any, error) {
			return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "password"}, nil
		}}
	}
	client := makeClient()
	var group sync.WaitGroup
	for range 12 {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err != nil {
				t.Error(err)
			}
		}()
	}
	group.Wait()
	if logins.Load() != 1 {
		t.Fatal("concurrent requests duplicated logins", logins.Load())
	}
	restarted := makeClient()
	if _, err := restarted.Do(context.Background(), "/pages", true, "GET", nil); err != nil {
		t.Fatal(err)
	}
	if logins.Load() != 1 {
		t.Fatal("restart ignored saved token")
	}
	value, err := restarted.BrowserSession(context.Background())
	if err != nil || value["token"] != "browser-token" {
		t.Fatal(value, err)
	}
	again := makeClient()
	if _, err := again.Do(context.Background(), "/pages", true, "GET", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := again.BrowserSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	if logins.Load() != 2 {
		t.Fatal("browser session did not persist independently", logins.Load())
	}
	raw, err := os.ReadFile(filepath.Join(directory, "artalk-sessions.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "private-backend-token") || strings.Contains(string(raw), "browser-token") {
		t.Fatal("tokens persisted in plaintext")
	}
	info, _ := os.Stat(filepath.Join(directory, "artalk-sessions.json"))
	if info.Mode().Perm() != 0600 {
		t.Fatal("cache permissions", info.Mode())
	}
}

func TestCaptchaCooldownSurvivesRestartAndIsShared(t *testing.T) {
	var logins atomic.Int32
	blocked := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/user/access_token" {
			logins.Add(1)
			if blocked {
				w.WriteHeader(403)
				json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"need_captcha": true}})
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"token": "token"})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer server.Close()
	directory := t.TempDir()
	now := time.Date(2026, 11, 17, 9, 0, 0, 0, time.UTC)
	makeClient := func() *Client {
		return &Client{Sessions: &SessionStore{Directory: directory, Key: []byte(strings.Repeat("k", 32))}, Now: func() time.Time { return now }, CaptchaReset: func() time.Duration { return 61 * time.Second }, Settings: func(context.Context) (map[string]any, error) {
			return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "password"}, nil
		}}
	}
	client := makeClient()
	for range 3 {
		if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err == nil {
			t.Fatal("expected captcha failure")
		}
	}
	if _, err := client.BrowserSession(context.Background()); err == nil {
		t.Fatal("browser ignored shared cooldown")
	}
	client = makeClient()
	if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err == nil {
		t.Fatal("restart ignored cooldown")
	}
	if logins.Load() != 1 {
		t.Fatal("repeated captcha logins", logins.Load())
	}
	now = now.Add(62 * time.Second)
	blocked = false
	if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err != nil {
		t.Fatal(err)
	}
	if logins.Load() != 2 {
		t.Fatal("did not resume after cooldown")
	}
}

func TestForbiddenDoesNotDiscardToken(t *testing.T) {
	var logins int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/user/access_token" {
			logins++
			json.NewEncoder(w).Encode(map[string]any{"token": "token"})
			return
		}
		w.WriteHeader(403)
		w.Write([]byte(`{"msg":"permission denied"}`))
	}))
	defer server.Close()
	client := Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "password"}, nil
	}}
	for range 3 {
		if _, err := client.Do(context.Background(), "/pages", true, "GET", nil); err == nil {
			t.Fatal("expected forbidden")
		}
	}
	if logins != 1 || client.token != "token" {
		t.Fatal("403 triggered reauthentication", logins)
	}
}

func TestCaptchaResetConfiguration(t *testing.T) {
	file := filepath.Join(t.TempDir(), "artalk.yml")
	for _, test := range []struct {
		yaml     string
		expected time.Duration
	}{{"captcha:\n  action_reset: 120\n", 121 * time.Second}, {"captcha:\n  action_reset: -1\n", -1}, {"captcha:\n  always: true\n", -1}, {"captcha: {}", time.Minute}} {
		os.WriteFile(file, []byte(test.yaml), 0600)
		if got := CaptchaReset(file); got != test.expected {
			t.Fatal(got, test.expected)
		}
	}
}

func TestAdminGuardLoginRequiredRefreshesPersistedSession(t *testing.T) {
	for _, body := range []string{`{"data":{"need_login":true}}`, `{"need_login":true}`} {
		t.Run(body, func(t *testing.T) {
			logins := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/api/v2/user/access_token" {
					logins++
					json.NewEncoder(w).Encode(map[string]any{"token": "fresh"})
					return
				}
				if r.Header.Get("Authorization") != "Bearer fresh" {
					w.WriteHeader(403)
					w.Write([]byte(body))
					return
				}
				json.NewEncoder(w).Encode(map[string]any{"ok": true})
			}))
			defer server.Close()
			client := Client{Settings: func(context.Context) (map[string]any, error) {
				return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "password"}, nil
			}, Sessions: &SessionStore{}}
			_, _, key, _ := client.configuration(context.Background())
			client.key, client.token = key, "expired"
			client.Sessions.load()
			client.Sessions.state.Sessions["backend"] = cachedSession{key, "expired"}
			result, err := client.Do(context.Background(), "/api/v2/pages", true, "GET", nil)
			if err != nil || result["ok"] != true || logins != 1 {
				t.Fatalf("result=%v err=%v logins=%d", result, err, logins)
			}
		})
	}
}
