package application

import (
	"context"
	"database/sql"
	"goblincwl/quartz-server/internal/credentials"
	"goblincwl/quartz-server/internal/httpapi"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGiteaMigrationAndProjectionKeepDatabaseAuthoritative(t *testing.T) {
	dir := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(dir, "credentials.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`CREATE TABLE provider_credentials(provider TEXT PRIMARY KEY,envelope TEXT,status TEXT,checked_at TEXT)`); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "gitea-token")
	os.WriteFile(file, []byte("legacy_token\n"), 0600)
	r := &Runtime{app: &httpapi.Server{Credentials: &credentials.Store{DB: db, Key: make([]byte, 32)}}, options: Options{GiteaMirrorTokenFile: file}}
	ctx := context.Background()
	if err = r.importGiteaToken(ctx); err != nil {
		t.Fatal(err)
	}
	value, err := r.app.Credentials.Read(ctx, "gitea")
	if err != nil || value != "legacy_token" {
		t.Fatal("migration failed", err)
	}
	var envelope string
	db.QueryRow("SELECT envelope FROM provider_credentials WHERE provider='gitea'").Scan(&envelope)
	if strings.Contains(envelope, "legacy_token") {
		t.Fatal("stored plaintext")
	}
	os.WriteFile(file, []byte("stale_token"), 0600)
	if err = r.importGiteaToken(ctx); err != nil {
		t.Fatal(err)
	}
	if err = r.projectToken(ctx, "gitea", file); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(file)
	if err != nil || string(raw) != "legacy_token\n" {
		t.Fatal("database value overwritten", err)
	}
	info, err := os.Stat(file)
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("unsafe permissions", err)
	}
}
