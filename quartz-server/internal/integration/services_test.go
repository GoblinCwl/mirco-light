package integration

import (
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/monitoring"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServiceRegistryInitialDataAndCRUD(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	registry := &monitoring.Registry{DB: db, Key: make([]byte, 32)}
	services, err := registry.Services(ctx, true)
	if err != nil || len(services) != 11 {
		t.Fatal("initial service data missing", len(services), err)
	}
	for _, service := range services {
		if service.ID == "syncthing" && (service.Integration != "" || service.URL != "http://syncthing:8384/rest/noauth/health") {
			t.Fatal("Syncthing must remain ordinary monitoring data", service)
		}
	}
	for _, integration := range monitoring.Integrations() {
		if integration["id"] == "syncthing" {
			t.Fatal("Syncthing has no business integration")
		}
	}
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		if !ok || username != "demo" || password != "secret" {
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(204)
	}))
	defer endpoint.Close()
	if err := registry.SaveService(ctx, monitoring.ServiceConfig{Name: "Other without authentication", URL: endpoint.URL, Enabled: true, Order: 500}, true); err != nil {
		t.Fatal(err)
	}
	if err := registry.SaveCredential(ctx, monitoring.Credential{Name: "Private endpoint", Type: "basic", Username: "demo", Secret: "secret"}, true); err != nil {
		t.Fatal(err)
	}
	accounts, err := registry.Credentials(ctx)
	if err != nil || len(accounts) != 1 {
		t.Fatal(accounts, err)
	}
	encoded, _ := json.Marshal(accounts)
	if strings.Contains(string(encoded), "secret") || strings.Contains(string(encoded), "envelope") {
		t.Fatal("secret leaked")
	}
	var ciphertext string
	if err = db.QueryRow("SELECT envelope FROM service_credentials WHERE id=?", accounts[0].ID).Scan(&ciphertext); err != nil || strings.Contains(ciphertext, "secret") {
		t.Fatal("not encrypted", err)
	}
	services, _ = registry.Services(ctx, false)
	custom := services[len(services)-1]
	custom.CredentialID = accounts[0].ID
	if err = registry.SaveService(ctx, custom, false); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("GET", endpoint.URL, nil)
	if err = registry.Authorize(ctx, custom.CredentialID, request); err != nil {
		t.Fatal(err)
	}
	username, password, ok := request.BasicAuth()
	if !ok || username != "demo" || password != "secret" {
		t.Fatal("wrong authorization")
	}
	if registry.DeleteCredential(ctx, accounts[0].ID) == nil {
		t.Fatal("deleted active credential")
	}
	custom.Enabled = false
	if err = registry.SaveService(ctx, custom, false); err != nil {
		t.Fatal(err)
	}
	enabled, err := registry.Services(ctx, true)
	if err != nil || len(enabled) != 11 {
		t.Fatal(enabled, err)
	}
	if err = registry.DeleteService(ctx, custom.ID); err != nil {
		t.Fatal(err)
	}
	if err = registry.DeleteCredential(ctx, accounts[0].ID); err != nil {
		t.Fatal(err)
	}
	if err = registry.DeleteService(ctx, "artalk"); err != nil {
		t.Fatal(err)
	}
	enabled, err = registry.Services(ctx, true)
	if err != nil || len(enabled) != 10 {
		t.Fatal("deleted initial service recreated", enabled, err)
	}
	var business int
	if err = db.QueryRow("SELECT count(*) FROM settings").Scan(&business); err != nil || business != 0 {
		t.Fatal("business settings were changed", err)
	}
}
