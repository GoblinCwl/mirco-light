package settings

import (
	"testing"
)

func TestSettingsValidation(t *testing.T) {
	for _, test := range []struct {
		key   string
		value any
	}{{"openlist.url", "https://user:pass@example.com"}, {"openlist.url", "javascript:alert(1)"}, {"content.ignorePatterns", "../private"}, {"content.ignorePatterns", "!allowed"}, {"friends.items", "[]"}, {"missing", true}, {"graph.newDays", 1.5}, {"graph.newDays", float64(999)}, {"graph.loneStars", "true"}} {
		if _, err := validate(test.key, test.value); err == nil {
			t.Errorf("accepted invalid %s", test.key)
		}
	}
	value, err := validate("content.ignorePatterns", " Temp/**\nTemp/**\nWork/** ")
	if err != nil || value != "Temp/**\nWork/**" {
		t.Fatal(value, err)
	}
	if !Sensitive("openlist.password") || Sensitive("profile.name") {
		t.Fatal("public setting scope wrong")
	}
}

func TestAboutArticleRoute(t *testing.T) {
	for _, route := range []string{"", "/Memo/微光集介绍", "/Memo/site/", "/Memo/%E5%85%B3%E4%BA%8E"} {
		value, err := validate("site.aboutRoute", route)
		if err != nil || value != route {
			t.Fatalf("valid route %q: %v", route, err)
		}
	}
	value, err := validate("site.aboutRoute", "  /Memo/about  ")
	if err != nil || value != "/Memo/about" {
		t.Fatal(value, err)
	}
	for _, route := range []string{"https://example.com/about", "//example.com/about", "javascript:alert(1)", "Memo/about", "/", "/Memo/about?x=1", "/Memo/about#heading", "/Memo/../private", "/Memo/%2e%2e/private", "/Memo/%5cprivate", "/Memo/%00private", "/Memo/%", "/Memo//about"} {
		if _, err := validate("site.aboutRoute", route); err == nil {
			t.Fatalf("accepted invalid route %q", route)
		}
	}
}
