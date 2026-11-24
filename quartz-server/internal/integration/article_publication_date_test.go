package integration

import (
	"context"
	"encoding/xml"
	"goblincwl/quartz-server/internal/content"
	"strings"
	"testing"
)

func TestArticlePublicationDateCorrectionUpdatesRSS(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db, Origin: "https://site.test"}
	items := []content.Item{
		{SourceID: "corrected", Slug: "Memo/corrected", Title: "Corrected 🎉", PublishedAt: "2026-11-16T03:34:43Z", UpdatedAt: "2026-11-17T09:09:06Z", Extra: map[string]any{"rssCover": "https://img.test/cover.webp?a=1&b=2"}},
		{SourceID: "other", Slug: "Memo/other", Title: "Other", PublishedAt: "2026-11-17T01:54:13Z", UpdatedAt: "2026-11-17T09:09:06Z"},
	}
	if err := store.Sync(ctx, "article", items); err != nil {
		t.Fatal(err)
	}
	items[0].PublishedAt = "2026-11-17T08:30:11Z"
	if err := store.Sync(ctx, "article", items); err != nil {
		t.Fatal(err)
	}
	check := func() {
		t.Helper()
		var published string
		if err := db.QueryRow("SELECT published_at FROM content WHERE source_id='corrected'").Scan(&published); err != nil || published != "2026-11-17T08:30:11.000Z" {
			t.Fatal("publication date not corrected", published, err)
		}
		for _, kinds := range [][]string{nil, {"article"}} {
			raw, err := store.RSS(ctx, kinds...)
			if err != nil {
				t.Fatal(err)
			}
			var feed struct {
				Items []struct {
					Title       string `xml:"title"`
					Date        string `xml:"pubDate"`
					Description string `xml:"description"`
					Thumbnail   struct {
						URL string `xml:"url,attr"`
					} `xml:"http://search.yahoo.com/mrss/ thumbnail"`
				} `xml:"channel>item"`
			}
			if err := xml.Unmarshal([]byte(raw), &feed); err != nil {
				t.Fatal(err)
			}
			if len(feed.Items) != 2 || feed.Items[0].Title != items[0].Title || feed.Items[0].Date != "Tue, 17 Nov 2026 08:30:11 +0000" {
				t.Fatalf("incorrect RSS title, order or date: %+v", feed.Items)
			}
			if cover, fallback := feed.Items[0].Thumbnail.URL, feed.Items[1].Thumbnail.URL; cover != "https://img.test/cover.webp?a=1&b=2" || fallback != "https://site.test/static/rss-default.png" ||
				!strings.Contains(feed.Items[0].Description, `src="https://img.test/cover.webp?a=1&amp;b=2"`) {
				t.Fatalf("incorrect RSS covers: %+v", feed.Items)
			}
		}
	}
	check()
	missing := append([]content.Item(nil), items...)
	missing[0].PublishedAt = ""
	if err := store.Sync(ctx, "article", missing); err != nil {
		t.Fatal(err)
	}
	check()
}
