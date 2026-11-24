package integration

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"goblincwl/quartz-server/internal/adapters"
	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/journal"

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
	items[0].Extra["filePath"] = "Memo/a.md"
	root := t.TempDir()
	snapshot := &content.ArticleSnapshot{Store: store, Path: filepath.Join(root, "articles.json"), KnowledgeDirectory: filepath.Join(root, "knowledge")}
	raw, err := json.Marshal(map[string]any{
		"articles":  items,
		"knowledge": []map[string]string{{"sourceId": "Memo/a", "path": "Memo/a.md", "metadata": "custom: private metadata marker", "body": "# 星芽🌱\n\n完整 Markdown 正文"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(snapshot.Path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := snapshot.Import(ctx); err != nil {
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
	if _, err := db.ExecContext(ctx, `INSERT INTO friends(id,name,url,avatar,description,example,status,email,health_error) VALUES
		('public','Public friend','https://public.test/','','Public description',0,'展示中','private@example.test','private health marker'),
		('pending','Pending friend','https://pending.test/','','',0,'待审核','',''),
		('another','Another friend','https://another.test/','','',0,'展示中','','')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO friend_articles(friend_id,url_hash,title,url,published_at) VALUES
		('public',UNHEX(SHA2('public',256)),'Public post','https://public.test/post','2026-11-24T01:00:00.000Z'),
		('pending',UNHEX(SHA2('pending',256)),'Pending post','https://pending.test/post','2026-11-24T02:00:00.000Z')`); err != nil {
		t.Fatal(err)
	}
	adapter := &adapters.Manager{DB: db}
	for name, data := range map[string]map[string]any{
		"attendance": {"earliest": "2026-11", "latest": "2026-11"},
		"attendance:2026-11": {"records": []map[string]any{
			{"date": "2026-11-24", "specialName": "Special day", "private": "private calendar marker"},
			{"date": "2026-11-25"},
		}},
	} {
		if err := adapter.Save(ctx, name, data); err != nil {
			t.Fatal(err)
		}
	}
	if err := (journal.Store{DB: db}).Append(ctx, "content", map[string]any{"count": 3, "titles": []string{"private journal marker"}}, "", "page-test"); err != nil {
		t.Fatal(err)
	}
	app := &httpapi.Server{DB: db, Origin: store.Origin, Log: slog.Default(), Adapters: adapter}
	token := strings.Repeat("ab", 32)
	if err := app.EnableKnowledgeMCP(token, snapshot.KnowledgeDirectory); err != nil {
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
	if err != nil || len(tools.Tools) != 7 {
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
	readBody := func(arguments map[string]any) content.KnowledgeBody {
		t.Helper()
		var body content.KnowledgeBody
		call("get_work_content", arguments, &body)
		return body
	}
	markdown, err := os.ReadFile(filepath.Join(snapshot.KnowledgeDirectory, "current", "Memo", "a.md"))
	if err != nil {
		t.Fatal(err)
	}
	first := readBody(map[string]any{"source_url": "https://site.test/Memo/alias?pure=true#top"})
	if !first.Found || !first.Available || first.WorkID != result.Work.WorkID || first.URL != result.Work.URL ||
		first.Markdown != string(markdown) || first.NextOffset != nil {
		t.Fatalf("expected the exact exported Markdown: %+v", first)
	}
	fragment := readBody(map[string]any{"work_id": first.WorkID, "limit": 5})
	if fragment.Markdown != "---\nw" || fragment.NextOffset == nil || *fragment.NextOffset != 5 {
		t.Fatalf("incorrect first fragment: %+v", fragment)
	}
	if rest := readBody(map[string]any{"work_id": first.WorkID, "offset": *fragment.NextOffset}); fragment.Markdown+rest.Markdown != first.Markdown {
		t.Fatalf("incorrect continuation: %+v", rest)
	}
	for _, input := range []map[string]any{
		{"work_id": "article:Memo/locked"}, {"source_url": "/Memo/locked"}, {"work_id": "repo:sample"},
	} {
		if locked := readBody(input); locked.Found || locked.Available || locked.Markdown != "" {
			t.Fatalf("unexpected article export: %+v", locked)
		}
	}
	if empty := readBody(map[string]any{"work_id": "article:Memo/b"}); !empty.Found || empty.Available || empty.Markdown != "" {
		t.Fatalf("missing export should retain the index match: %+v", empty)
	}
	for _, input := range []map[string]any{
		{}, {"work_id": first.WorkID, "source_url": first.URL}, {"source_url": "https://external.test/Memo/a"},
	} {
		response, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "get_work_content", Arguments: input})
		if err != nil || !response.IsError {
			t.Fatalf("expected tool error for invalid input: %+v (%v)", response, err)
		}
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
	for _, tc := range []struct {
		input       map[string]any
		want, avoid string
	}{
		{map[string]any{"page": "https://site.test/friends/?pure=true"}, `"id":"latest_posts"`, `"items"`},
		{map[string]any{"page": "友链", "section": "friend_list", "limit": 1}, `"next_page":2`, "private"},
		{map[string]any{"page": "友链", "section": "latest_posts"}, "Public post", "Pending post"},
		{map[string]any{"page": "视界", "section": "works", "type": "repo"}, "Repository", "Article A"},
		{map[string]any{"page": "标签页", "section": "tags", "tag": "shar"}, `"tag":"Shared"`, `"tag":"Private"`},
		{map[string]any{"page": "https://site.test/tags/?tag=Shared", "section": "works", "type": "article"}, "Article A", "Repository"},
		{map[string]any{"page": "流光", "section": "works", "tag": "#Private"}, `"items":[]`, "Protected"},
		{map[string]any{"page": "/", "section": "calendar", "month": "2026-11"}, "Special day", "private calendar marker"},
		{map[string]any{"page": "/observatory/", "section": "journal"}, `"count":3`, "private journal marker"},
		{map[string]any{"page": "https://external.test/friends/"}, `"found":false`, "latest_posts"},
		{map[string]any{"page": "/observatory/admin"}, `"found":false`, "journal"},
	} {
		var output json.RawMessage
		call("get_page_context", tc.input, &output)
		if !strings.Contains(string(output), tc.want) || strings.Contains(string(output), tc.avoid) {
			t.Fatalf("unexpected page context for %v: %s", tc.input, output)
		}
	}
	if err := store.Sync(ctx, "article", items[1:]); err != nil {
		t.Fatal(err)
	}
	if lookup("article:Memo/a").Found || readBody(map[string]any{"work_id": "article:Memo/a"}).Found {
		t.Fatal("removed work was still returned")
	}
}
