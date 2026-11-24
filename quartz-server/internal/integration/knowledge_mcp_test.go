package integration

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/httpapi"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestKnowledgeMCPUsesLivePublicIndex(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db, Origin: "https://site.test"}
	items := []content.Item{
		{SourceID: "Memo/a", Slug: "Memo/a", Href: "/Memo/a", Title: "Article A", Links: []string{"Memo/b", "Memo/locked", "Repo/sample"}, Content: "vector corpus marker", Description: "Article synopsis", Tags: []string{"Shared"}, PublishedAt: "2026-11-23T16:00:00Z"},
		{SourceID: "Memo/b", Slug: "Memo/b", Href: "/Memo/b", Title: "Article B", Links: []string{"Memo/a", "Memo/alias"}, Tags: []string{"Shared"}, PublishedAt: "2026-11-24T15:59:59Z"},
		{SourceID: "Memo/locked", Slug: "Memo/locked", Title: "Protected", Encrypted: true, Links: []string{"Memo/a"}, Tags: []string{"Private"}},
	}
	items[0].Extra = map[string]any{"aliases": []string{"Memo/alias"}}
	if err := store.Sync(ctx, "article", items); err != nil {
		t.Fatal(err)
	}
	for kind, records := range map[string][]content.Item{
		"repo":  {{SourceID: "sample", Slug: "Repo/sample", Title: "Repository", Tags: []string{"Shared"}}},
		"video": {{SourceID: "demo", Slug: "Video/demo", Title: "Demo video"}},
		"share": {{SourceID: "public", Slug: "Share/分享/public", Title: "Public files"}, {SourceID: "locked", Slug: "Share/分享/locked", Title: "Locked files", Encrypted: true, Tags: []string{"Private"}}},
	} {
		if err := store.Sync(ctx, kind, records); err != nil {
			t.Fatal(err)
		}
	}
	app := &httpapi.Server{DB: db, Origin: store.Origin, Log: slog.Default()}
	token := strings.Repeat("ab", 32)
	if err := app.EnableKnowledgeMCP(token); err != nil {
		t.Fatal(err)
	}
	handler := app.Handler()
	const path = "/mcp/knowledge"
	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, path, nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unexpected unauthorized response: %d", unauthorized.Code)
	}

	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Header.Set("Authorization", "Bearer "+token)
		handler.ServeHTTP(w, r)
	}))
	defer endpoint.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "knowledge-integration", Version: "1.0.0"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: endpoint.URL + path, DisableStandaloneSSE: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 5 {
		t.Fatalf("unexpected MCP tools: %+v (%v)", tools, err)
	}
	call := func(name string, arguments map[string]any, output any) {
		t.Helper()
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: arguments})
		if err != nil || result.IsError {
			t.Fatalf("%s failed: %+v (%v)", name, result, err)
		}
		raw, err := json.Marshal(result.StructuredContent)
		if err != nil || strings.Contains(string(raw), "vector corpus marker") {
			t.Fatalf("invalid index output: %s (%v)", raw, err)
		}
		if err := json.Unmarshal(raw, output); err != nil {
			t.Fatal(err)
		}
	}
	lookup := func(id string) struct {
		Found bool                   `json:"found"`
		Work  *content.KnowledgeWork `json:"work"`
	} {
		t.Helper()
		var output struct {
			Found bool                   `json:"found"`
			Work  *content.KnowledgeWork `json:"work"`
		}
		call("lookup_work", map[string]any{"work_id": id}, &output)
		return output
	}
	result := lookup("article:Memo/a")
	if !result.Found || result.Work == nil || result.Work.URL != "https://site.test/Memo/a" ||
		len(result.Work.Links) != 2 || !slices.ContainsFunc(result.Work.Links, func(ref content.KnowledgeWorkRef) bool { return ref.Type == "repo" }) ||
		len(result.Work.Backlinks) != 1 || result.Work.Backlinks[0].WorkID != "article:Memo/b" {
		t.Fatalf("unexpected lookup result: %+v", result.Work)
	}
	if lookup("article:Memo/locked").Found {
		t.Fatal("protected work was returned")
	}
	var list content.KnowledgePage[content.KnowledgeSummary]
	call("list_works", map[string]any{"type": "article", "directory": "Memo", "tag": "#shared", "from": "2026-11-24", "to": "2026-11-24", "sort": "title_desc", "page_size": 1}, &list)
	if list.Total != 2 || !list.HasMore || len(list.Items) != 1 || list.Items[0].WorkID != "article:Memo/b" {
		t.Fatalf("unexpected filtered page: %+v", list)
	}
	for _, kind := range []string{"share", "repo", "video"} {
		call("list_works", map[string]any{"type": kind}, &list)
		if list.Total != 1 || len(list.Items) != 1 || lookup(list.Items[0].WorkID).Work.Type != kind {
			t.Fatalf("unexpected %s results: %+v", kind, list)
		}
	}
	call("search_works", map[string]any{"query": "VECTOR marker"}, &list)
	if list.Total != 1 || list.Items[0].WorkID != "article:Memo/a" {
		t.Fatalf("unexpected keyword matches: %+v", list)
	}
	var stats content.KnowledgeStatistics
	call("get_statistics", map[string]any{}, &stats)
	if stats.Total != 5 || stats.ByType["article"] != 2 || stats.ByType["share"] != 1 || len(stats.ByDirectory) != 4 {
		t.Fatalf("unexpected statistics: %+v", stats)
	}
	var tags content.KnowledgePage[content.KnowledgeTag]
	call("list_tags", map[string]any{"query": "shared"}, &tags)
	if tags.Total != 1 || tags.Items[0].Count != 3 {
		t.Fatalf("unexpected tag counts: %+v", tags)
	}
	if err := store.Sync(ctx, "article", items[1:]); err != nil {
		t.Fatal(err)
	}
	if lookup("article:Memo/a").Found {
		t.Fatal("removed work was still returned")
	}
}
