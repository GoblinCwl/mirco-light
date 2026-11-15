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

func TestRSSDefaultPostersByType(t *testing.T) {
	for _, kind := range []string{"article", "share", "repo", "video"} {
		if got := rssPosterURL("https://site.test/", kind); got != "https://site.test/static/rss/"+kind+".png?v=20261114-starlight" {
			t.Fatal(kind, got)
		}
	}
	if rssPosterURL("https://site.test", "../secret") != "" {
		t.Fatal("unknown poster type accepted")
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

func TestArticleFeedTitlesDoNotAddCategoryEmoji(t *testing.T) {
	article := Record{Type: "article", Title: "文章标题"}
	if rssFeedTitle(article, "article") != "文章标题" {
		t.Fatal("article feed added emoji")
	}
	if rssFeedTitle(article) != "✒️ 文章标题" {
		t.Fatal("default feed lost emoji")
	}
	if rssFeedTitle(Record{Type: "share", Title: "分享"}) != "🔗 分享" {
		t.Fatal("default mixed feed changed")
	}
}
