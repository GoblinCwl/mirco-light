package community

import (
	"strings"
	"testing"
)

func TestFriendValidation(t *testing.T) {
	base := Friend{Name: "站点", URL: "https://example.com", BacklinkURL: "https://example.com/friends", Avatar: "https://example.com/a.png", Description: "简介"}
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

func TestFriendRequiresHTTPSBacklinkPage(t *testing.T) {
	for _, address := range []string{"", "   ", "http://example.com/friends", "example.com", "https://", "https:///example.com", "https://user:pass@example.com/friends"} {
		for _, application := range []bool{false, true} {
			_, err := validFriend(Friend{Name: "站点", URL: "https://example.com", BacklinkURL: address, Avatar: "https://example.com/a.png", Description: "简介"}, application)
			if err == nil {
				t.Fatalf("accepted invalid backlink %q, application=%v", address, application)
			}
		}
	}
	valid, err := ValidateFriend(Friend{Name: "站点", URL: "http://example.com", BacklinkURL: " https://example.com/friends?q=1 ", Avatar: "/static/avatar.png"})
	if err != nil || valid.BacklinkURL != "https://example.com/friends?q=1" {
		t.Fatal(valid, err)
	}
}

func TestRSSAddressOptionalAndValidated(t *testing.T) {
	base := Friend{Name: "站点", URL: "https://example.com", BacklinkURL: "https://example.com/friends", Avatar: "https://example.com/avatar.png", Description: "简介"}
	for _, application := range []bool{false, true} {
		for _, address := range []string{"", "  ", "https://example.com/feed.xml", "http://example.com/rss"} {
			input := base
			input.RSSURL = address
			valid, err := validFriend(input, application)
			if err != nil || valid.RSSURL != strings.TrimSpace(address) {
				t.Fatal(address, application, valid, err)
			}
		}
		for _, address := range []string{"example.com/rss", "ftp://example.com/feed", "https://user:pass@example.com/feed", "javascript:alert(1)"} {
			input := base
			input.RSSURL = address
			if _, err := validFriend(input, application); err == nil {
				t.Fatal("accepted invalid RSS", address)
			}
		}
	}
}
