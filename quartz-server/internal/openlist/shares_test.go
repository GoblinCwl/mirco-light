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

func TestShareMetadataPatchPreservesOtherFields(t *testing.T) {
	current := map[string]any{"id": "example", "creator": "admin", "files": []any{"/file"}, "pwd": "keep-password", "expires": "2027-01-01T00:00:00Z", "max_accessed": float64(12), "header": "keep-header", "readme": "keep-readme", "remark": `{"tags":["old"],"comment":true,"sharedAt":"2026-11-01T00:00:00Z","order":7,"jellyfin":true,"aliases":{"/file":"alias"}}`}
	denied := false
	updates := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		respond := func(data any) { json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": data}) }
		switch r.URL.Path {
		case "/api/me":
			respond(map[string]any{"role": float64(2), "username": "admin", "base_path": "/"})
		case "/api/share/get":
			respond(current)
		case "/api/share/update":
			var input map[string]any
			json.NewDecoder(r.Body).Decode(&input)
			for key, value := range input {
				current[key] = value
			}
			updates++
			respond(nil)
		case "/api/v2/auth/email/login":
			w.Write([]byte(`{"token":"fixture"}`))
		case "/api/v2/pages":
			json.NewEncoder(w).Encode(map[string]any{"pages": []any{map[string]any{"id": 1, "key": comments.ShareKey("example"), "title": "example", "site_name": "site", "admin_only": denied}}})
		case "/api/v2/pages/1":
			var input map[string]any
			json.NewDecoder(r.Body).Decode(&input)
			denied = input["admin_only"] == true
			w.Write([]byte(`{}`))
		default:
			t.Error("unexpected route", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	settings := func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": server.URL, "api.artalk.url": server.URL, "api.artalk.email": "admin@test", "api.artalk.password": "fixture"}, nil
	}
	shares := Shares{Settings: settings, Artalk: &comments.Client{Settings: settings}, Site: "site"}
	ctx := context.Background()
	if _, err := shares.Operate(ctx, "share-update", map[string]any{"id": "example", "metadataPatch": map[string]any{"comment": false}}, "fixture"); err != nil {
		t.Fatal(err)
	}
	if !denied {
		t.Fatal("Artalk permission not updated")
	}
	if _, err := shares.Operate(ctx, "share-update", map[string]any{"id": "example", "metadataPatch": map[string]any{"tags": []any{"new"}}}, "fixture"); err != nil {
		t.Fatal(err)
	}
	meta, err := metadata(current["remark"])
	if err != nil || meta.Comment || len(meta.Tags) != 1 || meta.Tags[0] != "new" || meta.SharedAt != "2026-11-01T00:00:00.000Z" || meta.Aliases["/file"] != "alias" || meta.Jellyfin == nil || !*meta.Jellyfin || meta.Order == nil || *meta.Order != 7 {
		t.Fatal("unrelated metadata changed", meta, err)
	}
	if current["pwd"] != "keep-password" || current["header"] != "keep-header" || current["readme"] != "keep-readme" || current["expires"] != "2027-01-01T00:00:00Z" || current["max_accessed"] != float64(12) {
		t.Fatal("unrelated share fields changed")
	}
	if _, err := shares.Operate(ctx, "share-update", map[string]any{"id": "example", "metadataPatch": map[string]any{"pwd": "invalid"}}, "fixture"); err == nil || updates != 2 {
		t.Fatal("unrelated field accepted")
	}
}
