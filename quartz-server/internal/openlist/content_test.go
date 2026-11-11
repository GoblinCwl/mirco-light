package openlist

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestShareIndexReadsOneLevelAndCachesWithoutReadingProtectedShares(t *testing.T) {
	db, err := sql.Open("sqlite", "file:"+t.TempDir()+"/openlist.db")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	statements := []string{
		`CREATE TABLE x_users(id INTEGER,role INTEGER,base_path TEXT,disabled INTEGER,permission INTEGER)`,
		`INSERT INTO x_users VALUES(1,0,'/',0,16384)`,
		`CREATE TABLE x_sharing_dbs(id TEXT,files_raw TEXT,expires TEXT,pwd TEXT,accessed INTEGER,max_accessed INTEGER,remark TEXT,creator_id INTEGER,disabled INTEGER)`,
		`INSERT INTO x_sharing_dbs VALUES('public','["/actual/root"]','','',0,0,'{}',1,0),('protected','["/private"]','','password',0,0,'{}',1,0)`,
		`CREATE TABLE x_setting_items(key TEXT,value TEXT)`,
		`INSERT INTO x_setting_items VALUES('token','server-token')`,
	}
	for _, query := range statements {
		if _, err = db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["path"] != "/actual/root" || r.Header.Get("Authorization") != "server-token" {
			t.Errorf("unexpected recursive or protected request: %v", body)
		}
		var data any
		switch r.URL.Path {
		case "/api/fs/get":
			data = map[string]any{"is_dir": true}
		case "/api/fs/list":
			data = map[string]any{"content": []map[string]any{{"name": "folder", "is_dir": true}, {"name": "visible.txt", "is_dir": false}}}
		default:
			t.Error(r.URL.Path)
		}
		json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": data})
	}))
	defer upstream.Close()
	shares := &Shares{Adapter: &Adapter{DB: db}, Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": upstream.URL}, nil
	}}
	for range 2 {
		items, err := shares.Content(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if len(items) != 2 {
			t.Fatal(items)
		}
		for _, item := range items {
			if item.SourceID == "public" && item.Content != "folder\nvisible.txt" {
				t.Fatal(item)
			}
			if item.SourceID == "protected" && item.Content != "" {
				t.Fatal("private content exposed", item)
			}
		}
	}
	if calls != 2 {
		t.Fatal("root cache not reused", calls)
	}
}
