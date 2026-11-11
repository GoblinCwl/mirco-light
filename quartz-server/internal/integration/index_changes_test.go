package integration

import (
	"context"
	"fmt"
	"goblincwl/quartz-server/internal/content"
	"testing"
)

func TestUnchangedIndexSourcesExecuteNoWrites(t *testing.T) {
	for _, kind := range []string{"article", "share", "repo", "video"} {
		t.Run(kind, func(t *testing.T) {
			db := testDB(t)
			ctx := context.Background()
			store := content.Store{DB: db}
			items := []content.Item{{SourceID: "fixture", Slug: kind + "/fixture", Title: "Fixture", Content: "Body", Tags: []string{"source"}, PublishedAt: "2026-11-01T00:00:00Z", Extra: map[string]any{"play": 10}}}
			if err := store.Sync(ctx, kind, items); err != nil {
				t.Fatal(err)
			}
			// Reject statements before MySQL can optimize an equal-value UPDATE.
			// A successful second sync proves the application skipped SQL writes.
			for _, table := range []string{"content", "content_sources", "content_meta", "journal", "share_identities"} {
				for _, operation := range []string{"INSERT", "UPDATE", "DELETE"} {
					query := fmt.Sprintf("CREATE TRIGGER reject_%s_%s BEFORE %s ON %s FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='unchanged source attempted a write'", table, operation, operation, table)
					if _, err := db.Exec(query); err != nil {
						t.Fatal(err)
					}
				}
			}
			if err := store.Sync(ctx, kind, items); err != nil {
				t.Fatal("unchanged source wrote to database", err)
			}
		})
	}
}

func TestIndexUpdatesOnlyChangedItemsIncludingMetadata(t *testing.T) {
	for _, kind := range []string{"article", "share", "repo", "video"} {
		t.Run(kind, func(t *testing.T) {
			db := testDB(t)
			ctx := context.Background()
			store := content.Store{DB: db}
			items := []content.Item{
				{SourceID: "first", Slug: kind + "/first", Title: "First", PublishedAt: "2026-11-01T00:00:00Z", Extra: map[string]any{"play": 10}},
				{SourceID: "second", Slug: kind + "/second", Title: "Second", PublishedAt: "2026-11-01T00:00:00Z"},
			}
			if err := store.Sync(ctx, kind, items); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec("CREATE TABLE index_write_audit(id varchar(191))"); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec("CREATE TRIGGER audit_content AFTER UPDATE ON content FOR EACH ROW INSERT INTO index_write_audit VALUES(NEW.id)"); err != nil {
				t.Fatal(err)
			}
			syncOne := func() {
				t.Helper()
				if err := store.Sync(ctx, kind, items); err != nil {
					t.Fatal(err)
				}
				var count int
				if err := db.QueryRow("SELECT count(*) FROM index_write_audit").Scan(&count); err != nil || count != 1 {
					t.Fatal("expected exactly one changed item", count, err)
				}
				db.Exec("DELETE FROM index_write_audit")
			}
			items[0].Extra["play"] = 11 // Metadata changes must not be missed by semantic revision alone.
			syncOne()
			items[0].Href = "/custom/first/"
			syncOne()
			items[0].PublishedAt = "2026-11-02T00:00:00Z"
			if kind == "share" {
				syncOne()
			} else {
				items[0].UpdatedAt = "2026-11-03T00:00:00Z"
				syncOne()
			}
			items[0].Tags = []string{"changed"}
			syncOne()
			items = items[:1]
			if err := store.Sync(ctx, kind, items); err != nil {
				t.Fatal(err)
			}
			var count int
			if err := db.QueryRow("SELECT count(*) FROM content WHERE type=?", kind).Scan(&count); err != nil || count != 1 {
				t.Fatal("removed project retained", count, err)
			}
			items = append(items, content.Item{SourceID: "new", Slug: kind + "/new", Title: "New"})
			if err := store.Sync(ctx, kind, items); err != nil {
				t.Fatal(err)
			}
			if err := db.QueryRow("SELECT count(*) FROM content WHERE type=?", kind).Scan(&count); err != nil || count != 2 {
				t.Fatal("new project missing", count, err)
			}
		})
	}
}

func TestEmptyIndexSourceInitializesOnce(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db}
	if err := store.Sync(ctx, "video", []content.Item{}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("CREATE TRIGGER reject_source BEFORE UPDATE ON content_sources FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='unnecessary source write'"); err != nil {
		t.Fatal(err)
	}
	if err := store.Sync(ctx, "video", []content.Item{}); err != nil {
		t.Fatal("unchanged empty source wrote", err)
	}
}
