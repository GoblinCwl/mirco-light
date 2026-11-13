package repo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestCatalogUsesCommitInsteadOfMirrorPushTime(t *testing.T) {
	directory := fixture(t)
	root := t.TempDir()
	if err := os.Rename(directory, filepath.Join(root, "project.git")); err != nil {
		t.Fatal(err)
	}
	directory = filepath.Join(root, "project.git")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"name":"project","private":false,"mirror":true}]`))
	}))
	defer upstream.Close()
	snapshot := filepath.Join(t.TempDir(), "repositories.json")
	raw, _ := json.Marshal(map[string]any{"completedAt": "2026-11-13T12:00:00Z", "repositories": []any{map[string]any{"name": "project", "status": "ready", "default_branch": "main", "pushed_at": "2099-01-01T00:00:00Z"}}})
	if err := os.WriteFile(snapshot, raw, 0600); err != nil {
		t.Fatal(err)
	}
	adapter := Adapter{Root: root, CatalogFile: snapshot, Owner: "fixture", Origin: func(context.Context) (string, error) { return upstream.URL, nil }}
	result, err := adapter.Catalog(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_, expected, err := latestCommit(context.Background(), directory, "main")
	if err != nil {
		t.Fatal(err)
	}
	rows := result["repositories"].([]map[string]any)
	if len(rows) != 1 || rows[0]["pushed_at"] != expected {
		t.Fatalf("catalog date: %v, expected commit %s", rows, expected)
	}
	items, err := adapter.Content(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].UpdatedAt != expected {
		t.Fatalf("index date differs from catalog: %v", items)
	}
}
