package integration

import (
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/content"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestArticleTagsWriteNotesBeforeIndexRefresh(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "note.md")
	original := "---\ntitle: 'Keep quotes' # comment\ntags: [source]\npublish: true\n---\nOriginal body\n"
	if err := os.WriteFile(path, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}
	store := content.Store{DB: db, ArticleDirectory: dir}
	item := content.Item{SourceID: "note", Slug: "note", Title: "Note", Tags: []string{"source"}, Extra: map[string]any{"filePath": "note.md"}}
	if err := store.Sync(ctx, "article", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	indexed := func() []string {
		t.Helper()
		var raw string
		var tags []string
		if err := db.QueryRow("SELECT tags FROM content WHERE id='article:note'").Scan(&raw); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal([]byte(raw), &tags); err != nil {
			t.Fatal(err)
		}
		return tags
	}
	if _, err := store.EditTags(ctx, "article:note", []string{"custom"}, false); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(indexed(), []string{"source"}) {
		t.Fatal("index updated without successful Quartz build")
	}
	// A second operation before rebuilding must use the file, not the old index tags.
	if err := store.ChangeTag(ctx, "another", []string{"article:note"}, false); err != nil {
		t.Fatal(err)
	}
	state, err := store.Tags(ctx, "article:note")
	if err != nil || !reflect.DeepEqual(state["tags"], []string{"custom", "another"}) {
		t.Fatal(state, err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "title: 'Keep quotes' # comment") || !strings.HasSuffix(string(raw), "Original body\n") {
		t.Fatal("unrelated content rewritten")
	}
	item.Tags = []string{"custom", "another"}
	// A formerly managed row must follow its Markdown source after synchronization.
	if _, err = db.Exec("UPDATE content SET extra=JSON_SET(extra,'$.tagsManaged',CAST('true' AS JSON)) WHERE id='article:note'"); err != nil {
		t.Fatal(err)
	}
	if err = store.Sync(ctx, "article", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(indexed(), item.Tags) {
		t.Fatal("article source tags overridden")
	}
	var managed int
	if err = db.QueryRow("SELECT JSON_CONTAINS_PATH(extra,'one','$.tagsManaged') FROM content WHERE id='article:note'").Scan(&managed); err != nil || managed != 0 {
		t.Fatal("article manual override retained", err)
	}
	// Editing in Obsidian remains authoritative as well.
	if err = os.WriteFile(path, []byte(strings.Replace(string(raw), "another", "obsidian", 1)), 0644); err != nil {
		t.Fatal(err)
	}
	if err = store.ChangeTag(ctx, "custom", []string{"article:note"}, true); err != nil {
		t.Fatal(err)
	}
	state, err = store.Tags(ctx, "article:note")
	if err != nil || !reflect.DeepEqual(state["tags"], []string{"obsidian"}) {
		t.Fatal("lost newer file tags", state, err)
	}
	if _, err = store.EditTags(ctx, "article:note", []string{}, false); err != nil {
		t.Fatal(err)
	}
	state, err = store.Tags(ctx, "article:note")
	if err != nil || len(state["tags"].([]string)) != 0 {
		t.Fatal("could not clear tags", state, err)
	}
	if !reflect.DeepEqual(indexed(), item.Tags) {
		t.Fatal("file writes bypassed snapshot publication")
	}
}

func TestTagBatchPreflightsNotesBeforeChangingAnySource(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "valid.md")
	original := "---\ntags: [source]\n---\nBody"
	os.WriteFile(path, []byte(original), 0600)
	store := content.Store{DB: db, ArticleDirectory: dir}
	if err := store.Sync(ctx, "article", []content.Item{
		{SourceID: "valid", Slug: "valid", Title: "Valid", Tags: []string{"source"}, Extra: map[string]any{"filePath": "valid.md"}},
		{SourceID: "missing", Slug: "missing", Title: "Missing", Extra: map[string]any{"filePath": "missing.md"}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := store.ChangeTag(ctx, "new", []string{"article:valid", "article:missing"}, false); err == nil {
		t.Fatal("accepted missing note")
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != original {
		t.Fatal("failed batch changed a valid note")
	}
	if _, err := store.EditTags(ctx, "article:valid", []string{"../escape"}, false); err == nil {
		t.Fatal("accepted invalid tag")
	}
	raw, _ = os.ReadFile(path)
	if string(raw) != original {
		t.Fatal("invalid tag changed note")
	}
}
