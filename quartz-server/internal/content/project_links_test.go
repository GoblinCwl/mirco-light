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
