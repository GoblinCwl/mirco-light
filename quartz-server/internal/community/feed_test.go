package community

import (
	"net/url"
	"testing"
	"time"
)

func TestFriendFeedArticlesSelectPublishedLinks(t *testing.T) {
	base, err := url.Parse("https://friend.example/blog/feed.xml")
	if err != nil {
		t.Fatal(err)
	}
	feed, err := parseFeed([]byte(`<feed xmlns="http://www.w3.org/2005/Atom">
	  <entry><title>Edited older article</title><link href="old"/><published>2026-11-20T00:00:00Z</published><updated>2026-11-24T00:00:00Z</updated></entry>
	  <entry><title>New &amp; published</title><link rel="self" href="/entry.xml"/><link rel="alternate" href="/new"/><published>2026-11-22T00:00:00Z</published></entry>
	  <entry><title>Duplicated article</title><link href="/new"/><updated>2026-11-21T00:00:00Z</updated></entry>
	  <entry><title>No usable link</title><link href="javascript:alert(1)"/><published>2026-11-23T00:00:00Z</published></entry>
	</feed>`), base)
	if err != nil {
		t.Fatal(err)
	}
	if len(feed.articles) != 2 || feed.articles[0].Title != "New & published" || feed.articles[0].URL != "https://friend.example/new" ||
		feed.articles[1].URL != "https://friend.example/blog/old" || feed.articles[1].PublishedAt.Day() != 20 || feed.latest.Day() != 24 {
		t.Fatal(feed)
	}
}

func TestFriendFeedIdentityAndCover(t *testing.T) {
	base, err := url.Parse("https://friend.example/feed.xml")
	if err != nil {
		t.Fatal(err)
	}
	feeds := []string{
		`<rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><guid isPermaLink="false">article-42</guid><link>/old/</link><title>Old title</title><pubDate>2026-11-20</pubDate><media:thumbnail url="cover.jpg"/></item></channel></rss>`,
		`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>article-42</id><link href="/new/"/><title>New title</title><published>2026-11-24</published><summary type="html">&lt;img src="thumbnail.webp"&gt;</summary></entry></feed>`,
	}
	for i, source := range feeds {
		feed, err := parseFeed([]byte(source), base)
		if err != nil || len(feed.articles) != 1 {
			t.Fatal(feed, err)
		}
		item := feed.articles[0]
		wantCover := []string{"https://friend.example/old/cover.jpg", "https://friend.example/new/thumbnail.webp"}[i]
		if item.entryID != "article-42" || item.Cover != wantCover || item.PublishedAt.Day() != []int{20, 24}[i] {
			t.Fatal(item)
		}
	}
}

func TestFeedArticleDates(t *testing.T) {
	cases := []struct{ feed, want string }{
		{`<rss><channel><lastBuildDate>Fri, 01 Jan 2099 00:00:00 GMT</lastBuildDate><item><pubDate>Wed, 11 Nov 2026 08:00:00 +0800</pubDate></item><item><pubDate>Thu, 12 Nov 2026 12:00:00 +0800</pubDate></item></channel></rss>`, "2026-11-12T04:00:00Z"},
		{`<feed xmlns="http://www.w3.org/2005/Atom"><updated>2099-01-01T00:00:00Z</updated><entry><published>2026-11-10T00:00:00Z</published><updated>2026-11-12T05:00:00Z</updated></entry></feed>`, "2026-11-12T05:00:00Z"},
		{`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><dc:date>2026-11-12T15:00:00+08:00</dc:date></item></rdf:RDF>`, "2026-11-12T07:00:00Z"},
		{`<rss><channel><item><pubDate>invalid</pubDate></item><item><pubDate>12 Nov 26 10:00 +0800</pubDate></item></channel></rss>`, "2026-11-12T02:00:00Z"},
	}
	for _, c := range cases {
		got, err := ParseFeedDate([]byte(c.feed))
		if err != nil || got.Format(time.RFC3339) != c.want {
			t.Fatal(got, err, c.want)
		}
	}
	for _, feed := range []string{`<rss><channel><lastBuildDate>Thu, 12 Nov 2026 12:00:00 +0800</lastBuildDate></channel></rss>`, `<rss><item><pubDate>invalid</pubDate></item></rss>`, `<feed><entry>`} {
		if _, err := ParseFeedDate([]byte(feed)); err == nil {
			t.Fatal("accepted invalid article dates", feed)
		}
	}
}
func TestAvatarSourceAutomaticallyPreservedFromSubmission(t *testing.T) {
	base := Friend{Email: "fixture@example.test", Name: "网站", URL: "https://example.com", BacklinkURL: "https://example.com/friends", Avatar: "https://example.com/avatar.png", AvatarSource: "https://other.example/wrong.png"}
	f, err := ValidateFriend(base)
	if err != nil || f.AvatarSource != base.Avatar {
		t.Fatal(f, err)
	}
	base.Avatar = "/api/site/friends/avatar/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png"
	base.AvatarSource = ""
	f, err = ValidateFriend(base)
	if err != nil || f.AvatarSource != "" {
		t.Fatal(f, err)
	}
	base.AvatarSource = "javascript:alert(1)"
	if _, err = ValidateFriend(base); err == nil {
		t.Fatal("invalid source accepted")
	}
}

func TestFeedBareAmpersandInOlderArticleDoesNotLoseNewestDate(t *testing.T) {
	feed := `<rss><channel><item><pubDate>Thu, 05 Nov 2026 18:17:01 +0800</pubDate><description>newest &amp; valid</description></item><item><pubDate>Wed, 04 Nov 2026 10:00:00 +0800</pubDate><description>旧文章 &测试以及 &nbsp; 空格</description></item></channel></rss>`
	latest, err := ParseFeedDate([]byte(feed))
	if err != nil || latest.Format(time.RFC3339) != "2026-11-05T10:17:01Z" {
		t.Fatal(latest, err)
	}
	for _, bad := range []string{`<rss><item><pubDate>Thu, 05 Nov 2026 18:17:01 +0800</pubDate><description>&测试</broken></item></rss>`, `<rss><item><pubDate>Thu, 05 Nov 2026 18:17:01 +0800</pubDate><description>&#0;</description></item></rss>`} {
		if _, err := ParseFeedDate([]byte(bad)); err == nil {
			t.Fatal("accepted invalid XML structure or character")
		}
	}
}
