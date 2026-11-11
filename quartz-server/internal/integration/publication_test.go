package integration

import (
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/comments"
	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/journal"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
)

func TestContentJournalCommitsWithIndexAndRollsBackTogether(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db}
	item := content.Item{SourceID: "fixture", Slug: "fixture", Title: "Initial"}
	if err := store.Sync(ctx, "article", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	item.Title = "Updated"
	if err := store.Sync(ctx, "article", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	read := func() []journal.Event {
		t.Helper()
		events, err := (journal.Store{DB: db}).Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		return events
	}
	if events := read(); len(events) != 1 || events[0].Kind != "content" {
		t.Fatal("journal not immediately visible", events)
	}
	if err := store.Sync(ctx, "article", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	if len(read()) != 1 {
		t.Fatal("duplicate source refresh duplicated journal")
	}
	// Fail after the journal INSERT, during feed metadata update.
	if _, err := db.Exec("CREATE TRIGGER reject_feed BEFORE UPDATE ON content_meta FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='controlled failure'"); err != nil {
		t.Fatal(err)
	}
	item.Title = "Must roll back"
	if err := store.Sync(ctx, "article", []content.Item{item}); err == nil {
		t.Fatal("accepted controlled failure")
	}
	var title string
	if err := db.QueryRow("SELECT title FROM content WHERE id='article:fixture'").Scan(&title); err != nil {
		t.Fatal(err)
	}
	if title != "Updated" || len(read()) != 1 {
		t.Fatal("index and journal did not roll back together")
	}
	if _, err := db.Exec("DROP TRIGGER reject_feed"); err != nil {
		t.Fatal(err)
	}
	if err := store.Sync(ctx, "article", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	if len(read()) != 2 {
		t.Fatal("retry did not produce exactly one event")
	}
	var obsolete int
	if err := db.QueryRow("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='content_changes'").Scan(&obsolete); err != nil || obsolete != 0 {
		t.Fatal("obsolete event queue retained", err)
	}
}

func TestArticlePublicationCheckpointOnlyAdvancesOnSuccess(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "articles.json")
	snapshot := &content.ArticleSnapshot{Store: content.Store{DB: db}, Path: path}
	if err := snapshot.Import(ctx); err == nil {
		t.Fatal("accepted missing snapshot")
	}
	write := func(title string) {
		t.Helper()
		raw, _ := json.Marshal(map[string]any{"articles": []content.Item{{SourceID: "fixture", Slug: "fixture", Title: title}}})
		if err := os.WriteFile(path, raw, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("Initial")
	if err := snapshot.Import(ctx); err != nil {
		t.Fatal(err)
	}
	// Repeated delivery of the same snapshot must not even execute index SQL.
	if _, err := db.Exec("CREATE TRIGGER reject_content BEFORE UPDATE ON content FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='controlled failure'"); err != nil {
		t.Fatal(err)
	}
	if err := snapshot.Import(ctx); err != nil {
		t.Fatal("duplicate delivery touched SQL", err)
	}
	write("Changed")
	if err := snapshot.Import(ctx); err == nil {
		t.Fatal("accepted failed import")
	}
	if _, err := db.Exec("DROP TRIGGER reject_content"); err != nil {
		t.Fatal(err)
	}
	if err := snapshot.Import(ctx); err != nil {
		t.Fatal("failure incorrectly advanced checkpoint", err)
	}
	os.WriteFile(path, []byte(`{"permissions":[]}`), 0600)
	if err := snapshot.Import(ctx); err == nil {
		t.Fatal("accepted incomplete snapshot")
	}
	var title string
	if err := db.QueryRow("SELECT title FROM content WHERE id='article:fixture'").Scan(&title); err != nil || title != "Changed" {
		t.Fatal("incomplete snapshot changed index", title, err)
	}
}

func TestArticlePermissionEventsCheckpointAndRetry(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "articles.json")
	var calls, updates atomic.Int32
	var fail atomic.Bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if fail.Load() {
			w.WriteHeader(503)
			w.Write([]byte(`{}`))
			return
		}
		switch {
		case r.URL.Path == "/api/v2/auth/email/login":
			w.Write([]byte(`{"token":"fixture"}`))
		case r.Method == "GET":
			json.NewEncoder(w).Encode(map[string]any{"pages": []map[string]any{{"id": 1, "key": "note", "site_name": "fixture", "title": "Note", "admin_only": false}}})
		case r.Method == "PUT":
			updates.Add(1)
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected upstream request %s %s", r.Method, r.URL.Path)
		}
	}))
	defer upstream.Close()
	client := &comments.Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": upstream.URL, "api.artalk.email": "fixture@example.test", "api.artalk.password": "fixture"}, nil
	}}
	permissions := &comments.Permissions{DB: db, Client: client, SnapshotPath: path, Site: "fixture"}
	os.WriteFile(path, []byte(`{"articles":[],"permissions":[{"key":"note","title":"Note","adminOnly":true}]}`), 0600)
	fail.Store(true)
	if err := permissions.Refresh(ctx); err == nil {
		t.Fatal("failed upstream unexpectedly checkpointed")
	}
	fail.Store(false)
	if err := permissions.Refresh(ctx); err != nil {
		t.Fatal(err)
	}
	before := calls.Load()
	if updates.Load() != 1 {
		t.Fatal("permission was not applied", updates.Load())
	}
	if err := permissions.Refresh(ctx); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != before {
		t.Fatal("duplicate event queried Artalk despite successful checkpoint")
	}
}
