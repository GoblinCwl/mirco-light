package content

import (
	"reflect"
	"testing"
)

func TestProjectLinks(t *testing.T) {
	source := `[micro](https://goblincwl.site/Repo/micro-light) https://goblincwl.site/Video/BV1/?page=2#x。
<a href="/Share/%E5%88%86%E4%BA%AB/test?x=1&amp;y=2">share</a>
https://goblincwl.site/Repo/micro-light/ /Repo/other
https://evil.test/Repo/foreign https://goblincwl.site.evil/Repo/foreign https://user@goblincwl.site/Repo/user
https://goblincwl.site/Repo/self /Repo/other/file /Share/空间/private /Repo/%2e%2e /Repo/a%2Fb /Repo/%00
`
	want := []string{"Repo/micro-light", "Video/BV1", "Share/分享/test", "Repo/other"}
	if got := projectLinks("https://goblincwl.site", source, "Repo/self"); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	if got := projectLinks("", source, ""); len(got) != 0 {
		t.Fatal(got)
	}
}

func TestArticleAndAliasReferencesAcrossSources(t *testing.T) {
	records := []Record{{Type: "article", Slug: "Memo/文章/index", Href: "/Memo/%E6%96%87%E7%AB%A0/", Extra: map[string]any{"aliases": []any{"about", "old/path"}}}, {Type: "article", Slug: "Memo/removed", Extra: map[string]any{}}, {Type: "repo", Slug: "Repo/code"}}
	routes := relationRoutes(records, "article", []Item{{Slug: "Memo/文章/index", Href: "/Memo/%E6%96%87%E7%AB%A0/", Extra: map[string]any{"aliases": []any{"about", "old/path"}}}})
	source := `[note](https://goblincwl.site/Memo/%E6%96%87%E7%AB%A0/?a=1#part) /about <a href="/old/path">alias</a>
 https://goblincwl.site/Memo/removed /Memo/unpublished /tags/ /reading/ //evil.test/about https://evil.test/about
 /Repo/unknown /Video/BV1 /Share/分享/id /Repo/code/file`
	want := []string{"Memo/文章", "Repo/unknown", "Video/BV1", "Share/分享/id"}
	if got := projectLinks("https://goblincwl.site", source, "Video/self", routes); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
	if got := projectLinks("https://goblincwl.site", "/about /Memo/文章/", "Memo/文章/index", routes); len(got) != 0 {
		t.Fatal("self references via alias leaked", got)
	}
}

func TestShareDescendantsReferenceOnlyTheirOwnShareRoot(t *testing.T) {
	source := `https://goblincwl.site/Share/分享/文章附件/日记日报方案/日记模板.md
 /Share/%E5%88%86%E4%BA%AB/文章附件/日记日报方案/file.js?x=1#section
 /Share/分享/文章附件备份/folder/file.md /Share/分享/文章附件/目录/
 https://evil.test/Share/分享/foreign/file.md /Share/分享/invalid/%2Fsecret /Share/分享/invalid//file /Repo/code/file`
	want := []string{"Share/分享/文章附件", "Share/分享/文章附件备份"}
	for _, routes := range []map[string]string{nil, {"Memo/note": "Memo/note"}} {
		if got := projectLinks("https://goblincwl.site", source, "Memo/source", routes); !reflect.DeepEqual(got, want) {
			t.Fatalf("got %v want %v", got, want)
		}
	}
	if got := projectLinks("https://goblincwl.site", "/Share/分享/文章附件/folder/file.md", "Share/分享/文章附件"); len(got) != 0 {
		t.Fatal("share self-reference leaked", got)
	}
}
