package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"goblincwl/quartz-server/internal/adapters"
	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/journal"
	"io"
	"log/slog"
	"net/http/httptest"
	"testing"
)

func TestShareAndRepoSearchBodiesSurviveTagEdits(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db}
	for _, kind := range []string{"repo", "share"} {
		item := content.Item{SourceID: "fixture", Slug: kind + "/fixture", Title: "Example", Content: "readme-and-directory-only-keyword", Description: "description-only-keyword", Tags: []string{"initial"}}
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
	}
	for _, query := range []string{"readme-and-directory-only-keyword", "description-only-keyword"} {
		rows, err := store.Search(ctx, query)
		if err != nil || len(rows) != 2 {
			t.Fatal(query, rows, err)
		}
	}
	// The same source text remains searchable after a manual tag mutation.
	if _, err := store.EditTags(ctx, "repo:fixture", []string{"changed"}, false); err != nil {
		t.Fatal(err)
	}
	rows, err := store.Search(ctx, "readme-and-directory-only-keyword")
	if err != nil || len(rows) != 2 {
		t.Fatal(rows, err)
	}
	item := content.Item{SourceID: "private", Slug: "Share/private", Title: "Locked", Content: "must-stay-private", Tags: []string{"private-tag"}, Encrypted: true}
	if err := store.Sync(ctx, "share", []content.Item{item}); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"must-stay-private", "private-tag"} {
		rows, err := store.Search(ctx, query)
		if err != nil || len(rows) != 0 {
			t.Fatal("protected index leaked", rows, err)
		}
	}
}

func TestJournalKeepsNewestDistinctDisplay(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := journal.Store{DB: db}
	for _, event := range []struct{ stamp, operation, key string }{{"2026-11-10T02:00:00.000Z", "restart", "new"}, {"2026-11-10T01:00:00.000Z", "recreate", "old"}, {"2026-11-10T03:00:00.000Z", "recreate", "latest"}} {
		if err := store.Append(ctx, "service", map[string]any{"service": "Jellyfin", "operation": event.operation}, event.stamp, event.key); err != nil {
			t.Fatal(err)
		}
	}
	events, err := store.Read(ctx)
	if err != nil || len(events) != 1 || events[0].CompletedAt != "2026-11-10T03:00:00.000Z" {
		t.Fatal(events, err)
	}
	for i := 0; i < 12; i++ {
		if err := store.Append(ctx, "site", map[string]any{"count": i}, fmt.Sprintf("2026-11-10T04:%02d:00.000Z", i), fmt.Sprint(i)); err != nil {
			t.Fatal(err)
		}
	}
	events, err = store.Read(ctx)
	if err != nil || len(events) != 10 || events[0].Payload["count"] != float64(11) {
		t.Fatal(events, err)
	}
	if err := store.Append(ctx, "site", map[string]any{"count": 11}, "2026-11-10T05:00:00.000Z", "repeat"); err != nil {
		t.Fatal(err)
	}
	events, err = store.Read(ctx)
	if err != nil || len(events) != 10 || events[0].CompletedAt != "2026-11-10T05:00:00.000Z" {
		t.Fatal(events, err)
	}
}

func TestAttendanceAPIHasOnlyThreeAdjacentMonths(t *testing.T) {
	db := testDB(t)
	manager := &adapters.Manager{DB: db, DiaryDirectory: t.TempDir()}
	if err := manager.RefreshAttendance(context.Background()); err != nil {
		t.Fatal(err)
	}
	server := &httpapi.Server{DB: db, Adapters: manager, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	response := httptest.NewRecorder()
	server.Handler().ServeHTTP(response, httptest.NewRequest("GET", "/api/attendance?month=2026-12", nil))
	var result struct {
		Month  string `json:"month"`
		Months []struct {
			Month string `json:"month"`
		} `json:"months"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || response.Code != 200 {
		t.Fatal(response.Code, response.Body.String(), err)
	}
	if result.Month != "2026-12" || len(result.Months) != 3 {
		t.Fatal(result)
	}
	for i, expected := range []string{"2026-11", "2026-12", "2027-01"} {
		if result.Months[i].Month != expected {
			t.Fatal(result)
		}
	}
}
