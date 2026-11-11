package content

import (
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
