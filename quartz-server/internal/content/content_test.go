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
