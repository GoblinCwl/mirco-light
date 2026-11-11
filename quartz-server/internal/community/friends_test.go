package community

import (
	"strings"
	"testing"
)

func TestFriendValidation(t *testing.T) {
	base := Friend{Name: "站点", URL: "https://example.com", Avatar: "https://example.com/a.png", Description: "简介"}
	valid, err := validFriend(base, true)
	if err != nil || valid.Status != "待审核" || valid.URL != "https://example.com/" {
		t.Fatal(valid, err)
	}
	for _, bad := range []Friend{{Name: "", URL: base.URL}, {Name: "x", URL: "https://user:pass@example.com"}, {Name: "x", URL: "javascript:alert(1)"}, {Name: "x", URL: base.URL, Avatar: "/static/../secret"}, {Name: "x", URL: base.URL, Status: "bad"}} {
		if _, err = validFriend(bad, false); err == nil {
			t.Fatalf("accepted invalid friend %+v", bad)
		}
	}
	base.Description = strings.Repeat("好", 41)
	if _, err = validFriend(base, true); err == nil {
		t.Fatal("long application accepted")
	}
	base.Description = "good"
	base.Avatar = "http://example.com/a"
	if _, err = validFriend(base, true); err == nil {
		t.Fatal("HTTP avatar accepted")
	}
}
