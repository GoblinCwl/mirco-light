package integration

import (
	"context"
	"encoding/json"
	"goblincwl/quartz-server/internal/content"
	"strings"
	"testing"
)

func TestReadingViewSortsPaginatesAndProtectsEncryptedContent(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db}
	items := []content.Item{{SourceID: "older", Slug: "Memo/older", Title: "Older", Content: "正文开头" + strings.Repeat("后续正文", 800), PublishedAt: "2026-11-01T00:00:00Z", UpdatedAt: "2026-11-02T00:00:00Z"}, {SourceID: "locked", Slug: "Memo/locked", Title: "Locked", Content: "DO_NOT_DISCLOSE", Description: "PRIVATE_DESCRIPTION", Encrypted: true, UpdatedAt: "2026-11-13T00:00:00Z"}}
	if err := store.Sync(ctx, "article", items); err != nil {
		t.Fatal(err)
	}
	if err := store.Sync(ctx, "repo", []content.Item{{SourceID: "repo", Slug: "Repo/example", Title: "Repo", Content: "README opening", UpdatedAt: "2026-11-12T00:00:00Z"}}); err != nil {
		t.Fatal(err)
	}
	// Defense in depth: even an accidentally populated encrypted index row stays private.
	if _, err := db.Exec("UPDATE content SET content='DO_NOT_DISCLOSE',description='PRIVATE_DESCRIPTION' WHERE source_id='locked'"); err != nil {
		t.Fatal(err)
	}
	result, err := store.Reading(ctx, 1, "")
	if err != nil {
		t.Fatal(err)
	}
	rows := result["items"].([]map[string]any)
	if len(rows) != 3 || rows[0]["title"] != "Locked" || rows[1]["title"] != "Repo" {
		t.Fatal(rows)
	}
	raw, _ := json.Marshal(result)
	if strings.Contains(string(raw), "DO_NOT_DISCLOSE") || strings.Contains(string(raw), "PRIVATE_DESCRIPTION") {
		t.Fatal("private content leaked")
	}
	if opening := rows[2]["excerpt"].(string); !strings.HasPrefix(opening, "正文开头") || len([]rune(opening)) > 2400 || len([]rune(opening)) <= 400 || rows[2]["excerptTruncated"] != true {
		t.Fatal("unbounded or incorrect opening")
	}
	result, err = store.Reading(ctx, 999, "article")
	if err != nil || result["total"] != 2 || result["page"] != 1 {
		t.Fatal(result, err)
	}
	if _, err = store.Reading(ctx, 1, "invalid"); err == nil {
		t.Fatal("invalid filter accepted")
	}
}
