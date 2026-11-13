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

func TestTaskSettingsValidation(t *testing.T) {
	for _, v := range []any{"24:00", "6:00", "06:00:00", "hello", float64(600)} {
		if _, err := validate("tasks.friendsTime", v); err == nil {
			t.Fatalf("accepted invalid time %v", v)
		}
	}
	if _, err := validate("tasks.friendsTime", "00:00"); err != nil {
		t.Fatal(err)
	}
	for _, v := range []any{float64(0), float64(1.5), float64(86401), "60"} {
		if _, err := validate("tasks.index-shareSeconds", v); err == nil {
			t.Fatalf("accepted invalid period %v", v)
		}
	}
	if _, err := validate("tasks.index-shareSeconds", float64(120)); err != nil {
		t.Fatal(err)
	}
	for _, f := range fields() {
		if len(f.Key) > 6 && f.Key[:6] == "tasks." && !Sensitive(f.Key) {
			t.Fatalf("exposed %s", f.Key)
		}
	}
}

func TestFoundedDateValidation(t *testing.T) {
	for _, value := range []string{"", "2024-02-29", "2020-01-01"} {
		if _, err := validate("site.foundedDate", value); err != nil {
			t.Fatalf("valid date %q: %v", value, err)
		}
	}
	for _, value := range []string{"2026-02-30", "2025-02-29", "2026-1-01", "9999-01-01", "invalid"} {
		if _, err := validate("site.foundedDate", value); err == nil {
			t.Fatalf("accepted invalid date %q", value)
		}
	}
}

func TestDirectoryHiddenPatterns(t *testing.T) {
	got, err := validate("content.directoryHiddenPatterns", " Memo/**\nPrivate/about.md\nMemo/** ")
	if err != nil || got != "Memo/**\nPrivate/about.md" {
		t.Fatal(got, err)
	}
	for _, value := range []string{"../secret", "/Private", "!Memo/**"} {
		if _, err := validate("content.directoryHiddenPatterns", value); err == nil {
			t.Fatal("accepted invalid pattern", value)
		}
	}
}
