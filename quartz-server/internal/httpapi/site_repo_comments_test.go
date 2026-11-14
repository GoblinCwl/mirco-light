package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"goblincwl/quartz-server/internal/comments"
	_ "modernc.org/sqlite"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestRepoCommentPermissionWritesRequireSiteAdministrator(t *testing.T) {
	app := &Server{Origin: "https://site.test"}
	for _, c := range []struct {
		path, origin string
		status       int
	}{{"/admin/repo-comments", "https://site.test", 401}, {"/admin/repo-comments", "https://evil.test", 403}, {"/repo-comments", "https://site.test", 405}} {
		req := httptest.NewRequest(http.MethodPut, "/api/site"+c.path+"?slug=Repo/test", strings.NewReader(`{"comment":false}`))
		req.Header.Set("Origin", c.origin)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != c.status {
			t.Fatal(c, res.Code, res.Body.String())
		}
	}
}

func TestRepoCommentDefaultAndArtalkPermissionPersistence(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "repo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	db.Exec("CREATE TABLE content(type TEXT,slug TEXT,title TEXT,href TEXT,encrypted INTEGER)")
	db.Exec("INSERT INTO content VALUES('repo','Repo/example','Example','/Repo/example/',0)")
	exists, denied := false, false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v2/auth/email/login":
			w.Write([]byte(`{"token":"fixture"}`))
		case "/api/v2/pages":
			pages := []any{}
			if exists {
				pages = append(pages, map[string]any{"id": 1, "key": "/Repo/example/", "title": "Example", "site_name": "site", "admin_only": denied})
			}
			json.NewEncoder(w).Encode(map[string]any{"pages": pages})
		case "/api/v2/pages/pv":
			exists = true
			w.Write([]byte(`{}`))
		case "/api/v2/pages/1":
			if r.Header.Get("Authorization") != "Bearer fixture" {
				t.Fatal("unauthenticated Artalk write")
			}
			var input map[string]any
			json.NewDecoder(r.Body).Decode(&input)
			denied = input["admin_only"] == true
			w.Write([]byte(`{}`))
		default:
			t.Error("unexpected upstream request", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer upstream.Close()
	app := &Server{DB: db, Comments: &comments.Archive{Site: "site", Client: &comments.Client{HTTP: upstream.Client(), Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": upstream.URL, "api.artalk.email": "admin@test", "api.artalk.password": "fixture"}, nil
	}}}}
	call := func(method, body string) map[string]any {
		req := httptest.NewRequest(method, "/api/site/repo-comments?slug=Repo/example", strings.NewReader(body))
		res := httptest.NewRecorder()
		app.siteRepoComments(res, req)
		if res.Code != 200 {
			t.Fatal(res.Code, res.Body.String())
		}
		var value map[string]any
		json.Unmarshal(res.Body.Bytes(), &value)
		return value
	}
	if call("GET", "")["comment"] != true {
		t.Fatal("new repository must allow comments")
	}
	call("PUT", `{"comment":false}`)
	if !denied || call("GET", "")["comment"] != false {
		t.Fatal("permission was not enforced by Artalk")
	}
	call("PUT", `{"comment":true}`)
	if denied || call("GET", "")["comment"] != true {
		t.Fatal("allow failed")
	}
}
