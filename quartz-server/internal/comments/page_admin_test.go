package comments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolvePublishedArticleIdentity(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "Memo"), 0755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(root, "Memo", "new.html"), []byte(`<div id="lock"></div><div data-page-key="Memo/new" data-page-title="New &amp; title" data-admin-only="true"></div>`), 0644)
	os.WriteFile(filepath.Join(root, "about.html"), []byte(`<div data-page-key="Memo/new" data-page-title="New &amp; title"></div>`), 0644)
	os.WriteFile(filepath.Join(root, "reading.html"), []byte(`<div>functional page</div>`), 0644)
	for _, route := range []string{"/Memo/new", "https://site.test/Memo/new", "Memo/new", "/about"} {
		target, err := ResolveArticle(root, "https://site.test", route)
		if err != nil || target.Key != "Memo/new" || target.Title != "New & title" {
			t.Fatal(route, target, err)
		}
	}
	for _, route := range []string{"https://evil.test/Memo/new", "//evil.test/Memo/new", "/missing", "/reading", "/Memo/new?x=1", "/%2e%2e/secret", "/Memo/new#heading"} {
		if _, err := ResolveArticle(root, "https://site.test", route); err == nil {
			t.Fatal("accepted invalid destination", route)
		}
	}
}

func TestPageListAndMigrationPreserveExistingComments(t *testing.T) {
	moved := []int{}
	failReply := false
	var policy map[string]any
	rows := []any{map[string]any{"id": 1, "key": "old", "title": "Old", "site_name": "site"}, map[string]any{"id": 2, "key": "new", "title": "New", "site_name": "site"}, map[string]any{"id": 3, "key": "empty", "title": "Empty", "site_name": "site"}}
	comments := []any{map[string]any{"id": 10, "page_key": "old", "site_name": "site"}, map[string]any{"id": 11, "page_key": "old", "site_name": "site"}, map[string]any{"id": 12, "page_key": "new", "site_name": "site"}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var result any
		switch {
		case r.URL.Path == "/api/v2/user/access_token":
			result = map[string]any{"token": "token"}
		case r.URL.Path == "/api/v2/pages":
			result = map[string]any{"count": 3, "pages": rows}
		case r.URL.Path == "/api/v2/comments":
			selected := comments
			if r.URL.Query().Get("scope") == "page" {
				selected = comments[:2]
			}
			result = map[string]any{"count": len(selected), "comments": selected}
		case r.URL.Path == "/api/v2/pages/pv":
			result = map[string]any{}
		case r.URL.Path == "/api/v2/pages/2" && r.Method == "PUT":
			json.NewDecoder(r.Body).Decode(&policy)
			result = map[string]any{}
		case strings.HasPrefix(r.URL.Path, "/api/v2/comments/"):
			id := 10
			if strings.HasSuffix(r.URL.Path, "11") {
				id = 11
			}
			if r.Method == "GET" {
				rid := 0
				if id == 11 {
					rid = 10
				}
				result = map[string]any{"comment": map[string]any{"id": id, "site_name": "site", "page_key": "old", "rid": rid, "content": "original", "is_pending": true, "is_pinned": true, "is_collapsed": false, "nick": "author", "email": "private@example.test", "ip": "private"}}
			} else {
				if failReply && id == 11 {
					w.WriteHeader(503)
					return
				}
				var input map[string]any
				json.NewDecoder(r.Body).Decode(&input)
				if input["page_key"] != "new" || input["content"] != "original" || input["is_pending"] != true || input["is_pinned"] != true || input["site_name"] != "site" || id == 11 && input["rid"] != float64(10) {
					t.Error("migration changed comment fields", input)
				}
				moved = append(moved, id)
				result = map[string]any{}
			}
		default:
			t.Error("unexpected upstream operation", r.Method, r.URL.Path)
			w.WriteHeader(500)
			return
		}
		json.NewEncoder(w).Encode(result)
	}))
	defer server.Close()
	service := &Service{Site: "site", Client: &Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@test", "api.artalk.password": "secret"}, nil
	}}, ResolvePage: func(_ context.Context, route string) (PageTarget, error) {
		return PageTarget{Key: "new", Title: "New", URL: "https://site.test/new", AdminOnly: true}, nil
	}}
	value, err := service.AdminPages(context.Background(), 1, "", "all")
	if err != nil {
		t.Fatal(err)
	}
	if value["total"] != 2 {
		t.Fatal("empty page must be excluded", value)
	}
	value, err = service.AdminPages(context.Background(), 1, "", "abnormal")
	if err != nil || value["total"] != 1 {
		t.Fatal("filter must happen before pagination", value, err)
	}
	if err := service.MovePage(context.Background(), 1, map[string]any{"old_key": "wrong", "route": "/new"}); err == nil {
		t.Fatal("stale source accepted")
	}
	if err := service.MovePage(context.Background(), 1, map[string]any{"old_key": "old", "route": "/new"}); err != nil {
		t.Fatal(err)
	}
	if len(moved) != 2 || moved[0] != 10 || moved[1] != 11 {
		t.Fatal("parent and replies were not migrated together", moved)
	}
	failReply = true
	if err := service.MovePage(context.Background(), 1, map[string]any{"old_key": "old", "route": "/new"}); err == nil || !strings.Contains(err.Error(), "已迁移 1 条") {
		t.Fatal("partial failure must be reported for retry", err)
	}
	if policy["admin_only"] != true || policy["key"] != "new" {
		t.Fatal("destination policy not retained", policy)
	}
}
