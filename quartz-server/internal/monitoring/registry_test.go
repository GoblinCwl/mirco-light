package monitoring

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func registryFixture(t *testing.T) *Registry {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "registry.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	for _, query := range []string{`CREATE TABLE service_credentials(id TEXT PRIMARY KEY,name TEXT,auth_type TEXT,username TEXT,header_name TEXT,envelope TEXT)`, `CREATE TABLE monitored_services(id TEXT PRIMARY KEY,name TEXT,integration TEXT,icon_svg TEXT NOT NULL DEFAULT '',container_name TEXT,http_url TEXT,strict_status INTEGER,credential_id TEXT,enabled INTEGER,sort_order INTEGER)`} {
		if _, err = db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	return &Registry{DB: db, Key: make([]byte, 32)}
}

func TestServiceSVGPreservedAndValidated(t *testing.T) {
	r := registryFixture(t)
	ctx := context.Background()
	icon := `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 2h20v20H2Z"/></svg>`
	cfg := ServiceConfig{Name: "SVG", Integration: "jellyfin", Icon: icon, Enabled: true}
	if err := r.SaveService(ctx, cfg, true); err != nil {
		t.Fatal(err)
	}
	list, err := r.Services(ctx, true)
	if err != nil || len(list) != 1 || list[0].Icon != icon || list[0].displayIcon() != icon {
		t.Fatal(list, err)
	}
	cfg = list[0]
	cfg.Enabled = false
	if err = r.SaveService(ctx, cfg, false); err != nil {
		t.Fatal(err)
	}
	list, err = r.Services(ctx, false)
	if err != nil || list[0].Icon != icon {
		t.Fatal("enable toggle lost SVG", err)
	}
	for _, bad := range []string{`<svg onload="alert(1)"/>`, `<svg><use href="https://example.com"/></svg>`, `<svg><foreignObject/></svg>`} {
		cfg.Icon = bad
		if err = r.SaveService(ctx, cfg, false); err == nil {
			t.Fatal("accepted unsafe SVG")
		}
	}
	cfg.Icon = ""
	if err = r.SaveService(ctx, cfg, false); err != nil {
		t.Fatal(err)
	}
	list, err = r.Services(ctx, false)
	if err != nil || list[0].displayIcon() != "jellyfin" {
		t.Fatal("default service icon missing", err)
	}
}
func TestServiceRegistryCRUDAndEncryptedOptionalCredentials(t *testing.T) {
	registry := registryFixture(t)
	ctx := context.Background()
	// A custom unauthenticated endpoint is sufficient; no token is required.
	config := ServiceConfig{Name: "Custom", URL: "http://example.test/health", Enabled: true, Strict: true, Order: 3}
	if err := registry.SaveService(ctx, config, true); err != nil {
		t.Fatal(err)
	}
	services, err := registry.Services(ctx, true)
	if err != nil || len(services) != 1 || services[0].CredentialID != "" {
		t.Fatal(services, err)
	}
	config = services[0]
	config.Enabled = false
	if err := registry.SaveService(ctx, config, false); err != nil {
		t.Fatal(err)
	}
	services, err = registry.Services(ctx, true)
	if err != nil || len(services) != 0 {
		t.Fatal(services, err)
	}
	account := Credential{Name: "Private", Type: "basic", Username: "account", Secret: "sample-password"}
	if err := registry.SaveCredential(ctx, account, true); err != nil {
		t.Fatal(err)
	}
	credentials, err := registry.Credentials(ctx)
	if err != nil || len(credentials) != 1 {
		t.Fatal(credentials, err)
	}
	encoded, _ := json.Marshal(credentials)
	if strings.Contains(string(encoded), "sample-password") || strings.Contains(string(encoded), "ciphertext") {
		t.Fatal("credential data leaked")
	}
	id := credentials[0].ID
	var raw string
	registry.DB.QueryRow("SELECT envelope FROM service_credentials WHERE id=?", id).Scan(&raw)
	if strings.Contains(raw, "sample-password") {
		t.Fatal("stored plaintext")
	}
	request := httptest.NewRequest("GET", "http://test/", nil)
	if err := registry.Authorize(ctx, id, request); err != nil {
		t.Fatal(err)
	}
	username, password, ok := request.BasicAuth()
	if !ok || username != "account" || password != "sample-password" {
		t.Fatal("basic auth not applied")
	}
	config.CredentialID = id
	if err := registry.SaveService(ctx, config, false); err != nil {
		t.Fatal(err)
	}
	if registry.DeleteCredential(ctx, id) == nil {
		t.Fatal("deleted referenced credential")
	}
	if err := registry.DeleteService(ctx, config.ID); err != nil {
		t.Fatal(err)
	}
	if err := registry.DeleteCredential(ctx, id); err != nil {
		t.Fatal(err)
	}
}
func TestServiceRegistryRejectsInvalidEntries(t *testing.T) {
	registry := registryFixture(t)
	ctx := context.Background()
	for _, config := range []ServiceConfig{{Name: "Missing URL"}, {Name: "Bad", URL: "http://user:pass@example.test"}, {Name: "Bad", URL: "file:///etc/passwd"}, {Name: "Bad", Integration: "unknown"}} {
		if registry.SaveService(ctx, config, true) == nil {
			t.Fatal("accepted invalid service", config)
		}
	}
	if err := registry.SaveService(ctx, ServiceConfig{Name: "Existing", Integration: "jellyfin", Enabled: true}, true); err != nil {
		t.Fatal("integration requires no copied URL or account", err)
	}
}

func TestServiceCredentialsBearerAndCustomHeader(t *testing.T) {
	registry := registryFixture(t)
	ctx := context.Background()
	for _, account := range []Credential{{Name: "Bearer", Type: "bearer", Secret: "token-example"}, {Name: "Header", Type: "header", Header: "X-API-Key", Secret: "key-example"}} {
		if err := registry.SaveCredential(ctx, account, true); err != nil {
			t.Fatal(err)
		}
	}
	accounts, err := registry.Credentials(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, account := range accounts {
		request := httptest.NewRequest("GET", "http://example.test", nil)
		if err = registry.Authorize(ctx, account.ID, request); err != nil {
			t.Fatal(err)
		}
		if account.Type == "bearer" && request.Header.Get("Authorization") != "Bearer token-example" {
			t.Fatal("bearer missing")
		}
		if account.Type == "header" && request.Header.Get("X-API-Key") != "key-example" {
			t.Fatal("custom header missing")
		}
	}
}
