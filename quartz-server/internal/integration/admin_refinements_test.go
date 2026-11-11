package integration

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/credentials"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/monitoring"
)

func TestRebindKeepsOldFactorUntilConfirmationAndRevokesOldCredentials(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("04", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	password := "rebind-password-for-tests"
	ip := "192.0.2.50"
	if err = service.SetPassword(ctx, password); err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1800000000, 0)
	service.Now = func() time.Time { return now }
	setup, err := service.Login(ctx, ip, auth.Input{Password: password})
	if err != nil {
		t.Fatal(err)
	}
	oldSecret := setup["secret"].(string)
	confirmed, err := service.Confirm(ctx, ip, auth.Input{SetupToken: setup["setupToken"].(string), Code: currentCode(oldSecret, now)})
	if err != nil {
		t.Fatal(err)
	}
	oldRecovery := confirmed["recoveryCodes"].([]string)[0]
	logged, err := service.Finish(ctx, ip, auth.Input{CompletionToken: confirmed["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal(err)
	}
	oldToken := logged["token"].(string)
	handler := (&httpapi.Server{DB: db, Auth: service, Origin: "https://site.test", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}).Handler()
	for _, tc := range []struct {
		origin, token string
		status        int
	}{{"https://site.test", "", 401}, {"https://wrong.test", oldToken, 403}} {
		req := httptest.NewRequest("POST", "/api/site/admin/totp/rebind", strings.NewReader(`{}`))
		req.Header.Set("Origin", tc.origin)
		if tc.token != "" {
			req.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: tc.token})
		}
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, req)
		if out.Code != tc.status {
			t.Fatal("rebind auth guard", out.Code)
		}
	}
	if _, err = service.Rebind(ctx, ip, auth.Input{Password: "wrong", RecoveryCode: oldRecovery}); err == nil {
		t.Fatal("wrong password accepted")
	}
	if _, err = service.Rebind(ctx, ip, auth.Input{Password: password, Code: "invalid"}); err == nil {
		t.Fatal("wrong factor accepted")
	}
	now = now.Add(30 * time.Second)
	pending, err := service.Rebind(ctx, ip, auth.Input{Password: password, Code: currentCode(oldSecret, now)})
	if err != nil {
		t.Fatal(err)
	}
	if !service.Authenticated(ctx, oldToken) {
		t.Fatal("starting rebind revoked active session")
	}
	if _, err = service.Confirm(ctx, "192.0.2.51", auth.Input{SetupToken: pending["setupToken"].(string), Code: currentCode(pending["secret"].(string), now)}); err == nil {
		t.Fatal("proof accepted from different IP")
	}
	// Starting or cancelling the flow has not removed the original factor.
	now = now.Add(30 * time.Second)
	if _, err = service.Login(ctx, ip, auth.Input{Password: password, Code: currentCode(oldSecret, now)}); err != nil {
		t.Fatal("old factor stopped before confirmation", err)
	}
	now = now.Add(30 * time.Second)
	pending, err = service.Rebind(ctx, ip, auth.Input{Password: password, RecoveryCode: oldRecovery})
	if err != nil {
		t.Fatal(err)
	}
	newSecret := pending["secret"].(string)
	replacement, err := service.Confirm(ctx, ip, auth.Input{SetupToken: pending["setupToken"].(string), Code: currentCode(newSecret, now)})
	if err != nil {
		t.Fatal(err)
	}
	if service.Authenticated(ctx, oldToken) {
		t.Fatal("old session survived confirmation")
	}
	if _, err = service.Finish(ctx, ip, auth.Input{CompletionToken: replacement["completionToken"].(string)}); err == nil {
		t.Fatal("recovery acknowledgement bypassed")
	}
	complete, err := service.Finish(ctx, ip, auth.Input{CompletionToken: replacement["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal(err)
	}
	if !service.Authenticated(ctx, complete["token"].(string)) {
		t.Fatal("replacement session invalid")
	}
	if _, err = service.Login(ctx, ip, auth.Input{Password: password, RecoveryCode: confirmed["recoveryCodes"].([]string)[1]}); err == nil {
		t.Fatal("old recovery code survived")
	}
	now = now.Add(30 * time.Second)
	if _, err = service.Login(ctx, ip, auth.Input{Password: password, Code: currentCode(newSecret, now)}); err != nil {
		t.Fatal("new factor rejected", err)
	}
	// Secrets are encrypted in the database and only authenticated admin reads reveal provider values.
	store := &credentials.Store{DB: db, Key: make([]byte, 32)}
	if err = store.Import(ctx, "github", "github_pat_fixture"); err != nil {
		t.Fatal(err)
	}
	current, err := service.Login(ctx, ip, auth.Input{Password: password, RecoveryCode: replacement["recoveryCodes"].([]string)[0]})
	if err != nil {
		t.Fatal(err)
	}
	server := (&httpapi.Server{DB: db, Auth: service, Credentials: store, Origin: "https://site.test", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}).Handler()
	for _, allowed := range []bool{false, true} {
		req := httptest.NewRequest("GET", "/api/site/admin/upstreams", nil)
		if allowed {
			req.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: current["token"].(string)})
		}
		out := httptest.NewRecorder()
		server.ServeHTTP(out, req)
		if !allowed {
			if out.Code != 401 || strings.Contains(out.Body.String(), "github_pat_fixture") {
				t.Fatal("unauthorized credential read")
			}
			continue
		}
		if out.Code != 200 || out.Header().Get("Cache-Control") != "no-store" {
			t.Fatal(out.Code, out.Body.String())
		}
		var value map[string]map[string]any
		if err = json.Unmarshal(out.Body.Bytes(), &value); err != nil || value["github"]["value"] != "github_pat_fixture" {
			t.Fatal("admin credential not returned", err)
		}
	}
}

func TestServiceInlineAuthenticationAtomicityAndInternalURLs(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	registry := &monitoring.Registry{DB: db, Key: make([]byte, 32)}
	invalid := monitoring.ServiceConfig{Name: "broken", URL: "file:///bad"}
	auth := &monitoring.Credential{Type: "basic", Username: "demo", Secret: "private"}
	if err := registry.SaveConfiguredService(ctx, invalid, auth, true); err == nil {
		t.Fatal("invalid endpoint accepted")
	}
	var count int
	db.QueryRow("SELECT COUNT(*) FROM service_credentials").Scan(&count)
	if count != 0 {
		t.Fatal("failed service edit leaked a credential")
	}
	value := monitoring.ServiceConfig{Name: "Custom", URL: "http://example.test/health", Enabled: true, Order: 500}
	if err := registry.SaveConfiguredService(ctx, value, auth, true); err != nil {
		t.Fatal(err)
	}
	services, _ := registry.Services(ctx, false)
	value = services[len(services)-1]
	req := httptest.NewRequest("GET", value.URL, nil)
	if err := registry.Authorize(ctx, value.CredentialID, req); err != nil {
		t.Fatal(err)
	}
	if user, secret, ok := req.BasicAuth(); !ok || user != "demo" || secret != "private" {
		t.Fatal("wrong inline authentication")
	}
	if err := registry.SaveConfiguredService(ctx, value, &monitoring.Credential{Type: "basic", Username: "demo"}, false); err != nil {
		t.Fatal("blank secret should preserve value", err)
	}
	if err := registry.SaveConfiguredService(ctx, value, &monitoring.Credential{}, false); err != nil {
		t.Fatal(err)
	}
	db.QueryRow("SELECT COUNT(*) FROM service_credentials").Scan(&count)
	if count != 0 {
		t.Fatal("unused authentication not cleaned")
	}
	value.Integration = "quartz-server"
	value.URL = "http://wrong.test/override"
	if err := registry.SaveConfiguredService(ctx, value, nil, false); err != nil {
		t.Fatal(err)
	}
	services, _ = registry.Services(ctx, false)
	if services[len(services)-1].URL != "" {
		t.Fatal("integrated URL override stored")
	}
	found := false
	for _, option := range monitoring.IntegrationOptions(map[string]any{}) {
		if option["id"] == "quartz-server" {
			found = option["url"] == "http://quartz-server:8080/health/ready"
		}
	}
	if !found {
		t.Fatal("quartz-server source and URL missing")
	}
}
