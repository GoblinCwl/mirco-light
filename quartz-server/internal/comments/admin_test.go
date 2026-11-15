package comments

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestAdminListAndMutations(t *testing.T) {
	var mutations int
	var updated map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/auth/email/login" {
			json.NewEncoder(w).Encode(map[string]any{"token": "private-token"})
			return
		}
		if r.Header.Get("Authorization") != "Bearer private-token" {
			t.Error("management request missing authentication")
		}
		switch {
		case r.Method == "GET" && r.URL.Path == "/api/v2/comments":
			q := r.URL.Query()
			if q.Get("scope") != "site" || q.Get("site_name") != "my-site" || q.Get("offset") != "20" || q.Get("type") != "pending" {
				t.Error("incorrect comment query", q)
			}
			json.NewEncoder(w).Encode(map[string]any{"count": 21, "comments": []any{map[string]any{"id": 7, "content": "<script>unsafe</script>", "ip": "private", "token": "secret"}}})
		case r.Method == "GET" && r.URL.Path == "/api/v2/users/all":
			json.NewEncoder(w).Encode(map[string]any{"count": 3, "users": []any{map[string]any{"id": 1, "name": "Admin", "email": "admin@example.test", "is_admin": true, "password": "secret"}, map[string]any{"id": 2, "name": "Visitor", "email": "visitor@example.test", "is_admin": false}, map[string]any{"id": 3, "name": "Other Admin", "email": "other-admin@example.test", "is_admin": true}}})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/v2/comments/"):
			site := "my-site"
			if strings.HasSuffix(r.URL.Path, "8") {
				site = "another-site"
			}
			json.NewEncoder(w).Encode(map[string]any{"comment": map[string]any{"id": 7, "content": "original", "rid": 3, "site_name": site, "page_key": "/article", "is_pinned": true, "is_pending": true, "is_collapsed": false}})
		default:
			mutations++
			if r.Method != "DELETE" {
				json.NewDecoder(r.Body).Decode(&updated)
			}
			json.NewEncoder(w).Encode(map[string]any{"ok": true})
		}
	}))
	defer server.Close()
	client := &Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "secret"}, nil
	}}
	archive := &Archive{Client: client, Site: "my-site"}
	ctx := context.Background()
	value, err := archive.AdminList(ctx, "comments", 2, "text", "pending")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(value)
	if strings.Contains(string(raw), "private") || strings.Contains(string(raw), "secret") {
		t.Fatal("private fields leaked")
	}
	value, err = archive.AdminList(ctx, "users", 1, "", "all")
	if err != nil {
		t.Fatal(err)
	}
	users := value["items"].([]any)
	if len(users) != 1 || users[0].(map[string]any)["id"] != float64(2) || value["total"] != 1 {
		t.Fatal("administrator accounts must be excluded from rows and count", value)
	}
	raw, _ = json.Marshal(value)
	if strings.Contains(string(raw), "password") {
		t.Fatal("user password leaked")
	}
	if err = archive.AdminMutate(ctx, "comments", "PUT", 7, map[string]any{"is_pending": false}); err != nil {
		t.Fatal(err)
	}
	if updated["content"] != "original" || updated["rid"] != float64(3) || updated["is_pinned"] != true || updated["is_pending"] != false {
		t.Fatal("moderation overwrote other fields", updated)
	}
	before := mutations
	for _, kind := range []string{"PUT", "DELETE"} {
		for _, id := range []int64{1, 3} {
			if err = archive.AdminMutate(ctx, "users", kind, id, map[string]any{}); err == nil {
				t.Fatal("administrator was mutable", id)
			}
		}
	}
	if err = archive.AdminMutate(ctx, "comments", "DELETE", 8, nil); err == nil {
		t.Fatal("other site comment mutable")
	}
	if err = archive.AdminMutate(ctx, "comments", "PUT", 7, map[string]any{"site_name": "another-site"}); err == nil {
		t.Fatal("comment scope editable")
	}
	if mutations != before {
		t.Fatal("invalid operation reached upstream mutation")
	}
	user := map[string]any{"name": "Visitor", "email": "visitor@example.test", "link": "https://example.test", "is_admin": false, "receive_email": true, "password": "a-long-test-password"}
	if err = archive.AdminMutate(ctx, "users", "PUT", 2, user); err != nil {
		t.Fatal(err)
	}
	if updated["name"] != "Visitor" || updated["password"] != "a-long-test-password" {
		t.Fatal("user update missing fields")
	}
	before = mutations
	user["is_admin"] = true
	for _, operation := range []string{"POST", "PUT"} {
		if err = archive.AdminMutate(ctx, "users", operation, 2, user); err == nil {
			t.Fatal("ordinary-user management allowed administrator creation or promotion")
		}
	}
	if mutations != before {
		t.Fatal("administrator mutation reached upstream")
	}
	user["is_admin"] = false
	if err = archive.AdminMutate(ctx, "users", "DELETE", 2, nil); err != nil {
		t.Fatal(err)
	}
}

func TestOrdinaryUsersPaginationSkipsAdministratorOnlyChunks(t *testing.T) {
	rows := []any{}
	for id := 1; id <= 137; id++ {
		rows = append(rows, map[string]any{"id": id, "name": "needle", "email": fmt.Sprintf("user%d@example.test", id), "is_admin": id <= 110})
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v2/auth/email/login" {
			json.NewEncoder(w).Encode(map[string]any{"token": "token"})
			return
		}
		if r.URL.Query().Get("search") != "needle" {
			t.Error("search not propagated")
		}
		switch r.URL.Path {
		case "/api/v2/users/admin":
			json.NewEncoder(w).Encode(map[string]any{"count": 110, "users": []any{}})
		case "/api/v2/users/all":
			offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
			limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
			start, end := min(offset, len(rows)), min(offset+limit, len(rows))
			json.NewEncoder(w).Encode(map[string]any{"count": len(rows), "users": rows[start:end]})
		default:
			t.Error("unexpected path", r.URL.Path)
		}
	}))
	defer server.Close()
	archive := &Archive{Client: &Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": server.URL, "api.artalk.email": "admin@example.test", "api.artalk.password": "secret"}, nil
	}}}
	for page := 1; page <= 3; page++ {
		result, err := archive.AdminList(context.Background(), "users", page, "needle", "all")
		if err != nil {
			t.Fatal(err)
		}
		items := result["items"].([]any)
		expected := max(0, min(20, 27-(page-1)*20))
		if result["total"] != 27 || len(items) != expected {
			t.Fatal("wrong non-admin pagination", page, result)
		}
		for i, item := range items {
			row := item.(map[string]any)
			if row["is_admin"] != false || row["id"] != float64(111+(page-1)*20+i) {
				t.Fatal("wrong ordinary user", row)
			}
		}
	}
	if _, err := archive.AdminList(context.Background(), "users", 1, "", "admin"); err == nil {
		t.Fatal("administrator listing accepted")
	}
}
