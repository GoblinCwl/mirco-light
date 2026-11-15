package integration

import (
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/content"
	"reflect"
	"strings"
	"testing"
)

func TestRuntimeProjectReferenceSync(t *testing.T) {
	db := testDB(t)
	store := content.Store{DB: db, Origin: "https://site.test"}
	ctx := context.Background()
	for _, kind := range []string{"repo", "video", "share"} {
		item := content.Item{SourceID: "source", Slug: kind + "/source", Title: "Source"}
		if kind == "share" {
			item.Slug = "Share/分享/source"
			item.ReferenceContent = "https://site.test/Repo/target"
		} else {
			item.Content = "https://site.test/Repo/target"
		}
		check := func(want []string) {
			t.Helper()
			var raw string
			if err := db.QueryRow("SELECT links FROM content WHERE type=? AND source_id='source'", kind).Scan(&raw); err != nil {
				t.Fatal(err)
			}
			var got []string
			if err := json.Unmarshal([]byte(raw), &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("%s: got %v want %v", kind, got, want)
			}
		}
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		check([]string{"Repo/target"})
		item.Content = ""
		item.ReferenceContent = ""
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		check([]string{})
		item.Encrypted = true
		item.ReferenceContent = "https://site.test/Repo/private"
		item.Content = item.ReferenceContent
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		if kind == "share" {
			check([]string{"Repo/private"})
		} else {
			check([]string{})
		}
		var body, description, search string
		if err := db.QueryRow("SELECT content,description,search_text FROM content WHERE type=? AND source_id='source'", kind).Scan(&body, &description, &search); err != nil {
			t.Fatal(err)
		}
		if body != "" || description != "" || strings.Contains(search, "private") {
			t.Fatal("protected text exposed", kind)
		}
	}
}

func TestCrossTypeArticleBacklinksAndProtectedReferences(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db, Origin: "https://site.test"}
	target := content.Item{SourceID: "note", Slug: "Memo/note/index", Href: "/Memo/note/", Title: "Note", Extra: map[string]any{"aliases": []string{"about"}}}
	if err := store.Sync(ctx, "article", []content.Item{target}); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"repo", "video", "share"} {
		item := content.Item{SourceID: "source", Slug: kind + "/source", Title: "Source", Content: "[note](https://site.test/Memo/note/?x=1#heading) /about /reading/ /Memo/hidden"}
		if kind == "share" {
			item.Slug = "Share/分享/source"
			item.Encrypted = true
			item.ReferenceContent = item.Content
		}
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		var raw, body, search string
		if err := db.QueryRow("SELECT links,content,search_text FROM content WHERE type=?", kind).Scan(&raw, &body, &search); err != nil {
			t.Fatal(err)
		}
		var links []string
		json.Unmarshal([]byte(raw), &links)
		if !reflect.DeepEqual(links, []string{"Memo/note"}) {
			t.Fatal(kind, links)
		}
		if kind == "share" && (body != "" || strings.Contains(search, "about")) {
			t.Fatal("protected content exposed")
		}
		item.Content = ""
		item.ReferenceContent = ""
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		if err := db.QueryRow("SELECT links FROM content WHERE type=?", kind).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		json.Unmarshal([]byte(raw), &links)
		if len(links) != 0 {
			t.Fatal("removed reference retained", kind, links)
		}
	}
}
