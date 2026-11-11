package openlist

import (
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/comments"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSharePathsConfinedToUserBase(t *testing.T) {
	for _, files := range []any{[]any{"/private/file"}, []any{"/allowed/../private/file"}, []any{"/allowed/file", "/allowed/./file"}, []any{"/allowed/file\\other"}} {
		if _, err := SharePaths(files, map[string]any{"base_path": "/allowed"}); err == nil {
			t.Fatal(files)
		}
	}
	value, err := SharePaths([]any{"/allowed/file"}, map[string]any{"base_path": "/allowed"})
	if err != nil || len(value) != 1 {
		t.Fatal(value, err)
	}
}
func TestShareRenameRollsBackOnCommentFailure(t *testing.T) {
	var changes []map[string]any
	old := map[string]any{"id": "old", "creator": "admin", "files": []any{"/movie"}, "remark": `{"sharedAt":"2026-11-01T00:00:00Z","tags":["old"]}`}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jsonResponse := func(data any) { json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": data}) }
		switch r.URL.Path {
		case "/api/me":
			jsonResponse(map[string]any{"role": float64(2), "username": "admin", "base_path": "/"})
		case "/api/share/get":
			jsonResponse(old)
		case "/api/share/update":
			var input map[string]any
			json.NewDecoder(r.Body).Decode(&input)
			changes = append(changes, input)
			jsonResponse(nil)
		case "/api/v2/auth/email/login":
			json.NewEncoder(w).Encode(map[string]any{"token": "artalk"})
		case "/api/v2/pages":
			json.NewEncoder(w).Encode(map[string]any{"pages": []any{}})
		case "/api/v2/pages/pv":
			w.WriteHeader(503)
		default:
			t.Error("unexpected request", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	settings := func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": server.URL, "api.artalk.url": server.URL, "api.artalk.email": "a@b.test", "api.artalk.password": "secret"}, nil
	}
	shares := Shares{Settings: settings, Artalk: &comments.Client{Settings: settings}, Site: "test"}
	_, err := shares.Operate(context.Background(), "share-update", map[string]any{"id": "old", "new_id": "new", "remark": `{"tags":["new"]}`}, "OpenList-token")
	if err == nil || len(changes) != 2 {
		t.Fatal("rollback missing", err, changes)
	}
	if changes[0]["new_id"] != "new" || changes[1]["new_id"] != "old" || changes[1]["id"] != "new" {
		t.Fatal(changes)
	}
	if !strings.Contains(changes[0]["remark"].(string), "2026-11-01") {
		t.Fatal("share date lost")
	}
}
