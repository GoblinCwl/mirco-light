package openlist

import "testing"

func TestRoutes(t *testing.T) {
	for _, test := range []struct{ uri, view, share, path string }{{"/Share/", "guest", "", "/"}, {"/Share", "guest", "", "/"}, {"/Share/空间/a/", "storage", "", "/a"}, {"/Share/%E5%88%86%E4%BA%AB/test/a.mkv", "share", "test", "/a.mkv"}, {"/Share/访客/分享/", "guest", "", "/分享"}} {
		r := ParseRoute(test.uri)
		if !r.Valid || r.View != test.view || r.Share != test.share || r.Path != test.path {
			t.Fatalf("%s: %+v", test.uri, r)
		}
	}
	for _, uri := range []string{"/Drive/", "//Share/a", "/Share/分享/", "/Share/a%2fb", "/Share/%2e%2e/secret", "/Share/a//", "/Share/%00"} {
		if ParseRoute(uri).Valid {
			t.Errorf("accepted unsafe route %s", uri)
		}
	}
}
