package content

import (
	"fmt"
	"testing"
)

func TestContentPrivacyHelpers(t *testing.T) {
	if excerpt("before🔐β secret 🔐after") != "before[加密文本]after" {
		t.Fatal("encrypted block leaked")
	}
	if excerpt("before🔐γ secret") != "before[加密文本]" {
		t.Fatal("unclosed block leaked")
	}
	if encodeSlug("Share/分享/测试") != "/Share/%E5%88%86%E4%BA%AB/%E6%B5%8B%E8%AF%95/" {
		t.Fatal("slug encoding wrong")
	}
	if got := sourceTagsNormalized([]string{"A & B", "C#", "A & B"}); len(got) != 2 || got[0] != "A--and--B" || got[1] != "C" {
		t.Fatal(got)
	}
}

func TestRSSSelectsLatestPublishedBeforeLimiting(t *testing.T) {
	old := "2020-01-01T00:00:00.000Z"
	records := []Record{{ID: "recently-edited-old", Published: &old}, {ID: "missing-date"}}
	for i := 1; i <= 21; i++ {
		date := fmt.Sprintf("2026-11-%02dT00:00:00.000Z", i)
		records = append(records, Record{ID: fmt.Sprintf("item-%02d", i), Published: &date})
	}
	newest := "2099-01-01T00:00:00.000Z"
	records = append(records, Record{ID: "private", Published: &newest, Encrypted: true})
	items := rssItems(records)
	if len(items) != 20 || items[0].ID != "item-21" || items[19].ID != "item-02" {
		t.Fatal("feed selected by input/update order instead of publication time", items)
	}
	records = []Record{{ID: "undated"}, {ID: "dated", Published: &old}}
	items = rssItems(records)
	if items[0].ID != "dated" || items[1].ID != "undated" {
		t.Fatal("missing publication date did not sort last")
	}
}

func TestRSSCoverSelection(t *testing.T) {
	const origin = "https://site.test"
	for _, tt := range []struct {
		name, kind, href string
		item             Item
		want             string
	}{
		{"rendered article image", "article", "/Memo/note", Item{Extra: map[string]any{"rssCover": "/assets/body.webp"}, Description: "![摘要](https://img.test/summary.png)"}, origin + "/assets/body.webp"},
		{"article code copied to search text", "article", "/Memo/note", Item{Content: "![示意](https://img.test/example.png)"}, origin + "/static/rss-default.png"},
		{"summary after invalid body and code", "video", "/Video/BV1", Item{Content: "`<img src='/code.png'>`\n\n![无效](data:image/png;base64,AAAA)", Description: "![摘要](https://img.test/summary.png)"}, "https://img.test/summary.png"},
		{"share readme", "share", "/Share/group", Item{ReferenceContent: `<img src=""><img src="https://img.test/share.jpg"><img src="/later.png">`}, "https://img.test/share.jpg"},
		{"relative repository image", "repo", "/Repo/example", Item{Content: "![示意](assets/preview.png)", EventRevision: "commit", Extra: map[string]any{"name": "example"}}, origin + "/api/repo/example/raw?path=assets%2Fpreview.png&ref=commit"},
		{"video without description images", "video", "/Video/BV1", Item{Extra: map[string]any{"cover": "https://img.test/video.jpg"}}, origin + "/static/rss-default.png"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			cover := itemRSSCover(origin, tt.kind, tt.href, tt.item)
			if got := rssCoverURL(origin, Record{Href: tt.href, Extra: map[string]any{"rssCover": cover}}); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestArticleRSSFiltersBeforeApplyingLimit(t *testing.T) {
	records := []Record{}
	for i := 1; i <= 25; i++ {
		date := fmt.Sprintf("2026-11-%02dT00:00:00.000Z", i)
		records = append(records, Record{ID: fmt.Sprintf("article-%02d", i), Type: "article", Published: &date})
		records = append(records, Record{ID: fmt.Sprintf("video-%02d", i), Type: "video", Published: &date})
	}
	date := "2099-01-01T00:00:00.000Z"
	records = append(records, Record{ID: "private", Type: "article", Published: &date, Encrypted: true})
	items := rssItems(records, "article")
	if len(items) != 20 || items[0].ID != "article-25" || items[19].ID != "article-06" {
		t.Fatal(items)
	}
	for _, item := range items {
		if item.Type != "article" || item.Encrypted {
			t.Fatal("non-public article in feed", item)
		}
	}
	mixed := rssItems(records)
	foundVideo := false
	for _, item := range mixed {
		if item.Type == "video" {
			foundVideo = true
		}
	}
	if !foundVideo {
		t.Fatal("default feed lost mixed content")
	}
}
