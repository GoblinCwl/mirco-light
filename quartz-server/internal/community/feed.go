package community

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/publicfetch"
	"golang.org/x/net/html"
	"golang.org/x/text/encoding/htmlindex"
	"golang.org/x/text/transform"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

func feedTime(raw string) time.Time {
	for _, layout := range []string{time.RFC3339Nano, time.RFC1123Z, time.RFC1123, time.RFC822Z, time.RFC822, time.RFC850, time.ANSIC, "Mon, 2 Jan 2006 15:04:05 -0700", "Mon, 2 Jan 2006 15:04:05 MST", "2006-01-02T15:04:05-0700", "2006-01-02 15:04:05Z07:00", "2006-01-02"} {
		if stamp, err := time.Parse(layout, strings.TrimSpace(raw)); err == nil {
			return stamp.UTC()
		}
	}
	return time.Time{}
}

type feedSnapshot struct {
	latest   time.Time
	articles []FriendArticle
}

type feedImage struct {
	URL    string `xml:"url,attr"`
	Type   string `xml:"type,attr"`
	Medium string `xml:"medium,attr"`
}

func feedURL(base *url.URL, raw string) *url.URL {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	address, err := base.Parse(raw)
	if err != nil || address.Hostname() == "" || address.User != nil || (address.Scheme != "http" && address.Scheme != "https") || len(address.String()) > 1500 {
		return nil
	}
	return address
}

func feedHTMLCover(base *url.URL, fragments ...string) string {
	for _, fragment := range fragments {
		tokens := html.NewTokenizer(strings.NewReader(fragment))
		for kind := tokens.Next(); kind != html.ErrorToken; kind = tokens.Next() {
			if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
				continue
			}
			tag := tokens.Token()
			if tag.Data != "img" {
				continue
			}
			for _, attr := range tag.Attr {
				if attr.Key == "src" {
					if address := feedURL(base, attr.Val); address != nil {
						return address.String()
					}
				}
			}
		}
	}
	return ""
}

// ParseFeedDate considers article dates only, never channel lastBuildDate.
func ParseFeedDate(data []byte) (time.Time, error) {
	feed, err := parseFeed(data, nil)
	return feed.latest, err
}

func parseFeed(data []byte, base *url.URL) (feedSnapshot, error) {
	feed, err := decodeFeed(data, base)
	var syntax *xml.SyntaxError
	if !errors.As(err, &syntax) || !strings.Contains(syntax.Msg, "invalid character entity") {
		return feed, err
	}
	// Some feeds put bare ampersands or HTML entity names in old descriptions.
	// Escape only those entities, then retain strict XML structure validation.
	return decodeFeed(escapeFeedAmpersands(data), base)
}

var feedEntity = regexp.MustCompile(`^&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);$`)

func escapeFeedAmpersands(data []byte) []byte {
	var output bytes.Buffer
	from := 0
	for i, b := range data {
		if b != '&' {
			continue
		}
		tail := data[i:min(i+33, len(data))]
		if end := bytes.IndexByte(tail, ';'); end >= 0 && feedEntity.Match(tail[:end+1]) {
			continue
		}
		output.Write(data[from:i])
		output.WriteString("&amp;")
		from = i + 1
	}
	output.Write(data[from:])
	return output.Bytes()
}
func decodeFeed(data []byte, base *url.URL) (feedSnapshot, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.CharsetReader = func(label string, input io.Reader) (io.Reader, error) {
		enc, err := htmlindex.Get(label)
		if err != nil {
			return nil, err
		}
		return transform.NewReader(input, enc.NewDecoder()), nil
	}
	feed := feedSnapshot{articles: []FriendArticle{}}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return feedSnapshot{}, fmt.Errorf("RSS/Atom 内容无法解析: %w", err)
		}
		start, ok := token.(xml.StartElement)
		if !ok || (start.Name.Local != "item" && start.Name.Local != "entry") {
			continue
		}
		var item struct {
			Title string `xml:"title"`
			Links []struct {
				Text string `xml:",chardata"`
				Href string `xml:"href,attr"`
				Rel  string `xml:"rel,attr"`
				Type string `xml:"type,attr"`
			} `xml:"link"`
			GUID        string      `xml:"guid"`
			ID          string      `xml:"id"`
			Thumbnails  []feedImage `xml:"http://search.yahoo.com/mrss/ thumbnail"`
			Media       []feedImage `xml:"http://search.yahoo.com/mrss/ content"`
			Enclosures  []feedImage `xml:"enclosure"`
			Encoded     string      `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
			Content     string      `xml:"http://www.w3.org/2005/Atom content"`
			Description string      `xml:"description"`
			Summary     string      `xml:"summary"`
			Published   string      `xml:"published"`
			Updated     string      `xml:"updated"`
			PubDate     string      `xml:"pubDate"`
			Date        string      `xml:"date"`
		}
		if err := decoder.DecodeElement(&item, &start); err != nil {
			return feedSnapshot{}, fmt.Errorf("RSS/Atom 文章无法解析: %w", err)
		}
		var published time.Time
		for _, raw := range []string{item.Published, item.PubDate, item.Date, item.Updated} {
			stamp := feedTime(raw)
			if published.IsZero() {
				published = stamp
			}
			if stamp.After(feed.latest) {
				feed.latest = stamp
			}
		}
		title := strings.Join(strings.Fields(item.Title), " ")
		if base == nil || title == "" || published.IsZero() || published.Year() < 1000 || published.Year() > 9999 {
			continue
		}
		var permalink *url.URL
		for _, link := range item.Links {
			if link.Rel != "" && link.Rel != "alternate" {
				continue
			}
			raw := strings.TrimSpace(link.Href)
			if raw == "" {
				raw = strings.TrimSpace(link.Text)
			}
			if permalink = feedURL(base, raw); permalink != nil {
				break
			}
		}
		if permalink == nil {
			continue
		}
		cover := ""
		for _, link := range item.Links {
			if link.Rel == "enclosure" {
				item.Enclosures = append(item.Enclosures, feedImage{URL: link.Href, Type: link.Type})
			}
		}
		for _, image := range append(item.Thumbnails, item.Media...) {
			if image.Medium == "video" || image.Medium == "audio" || image.Type != "" && !strings.HasPrefix(image.Type, "image/") {
				continue
			}
			if address := feedURL(permalink, image.URL); address != nil {
				cover = address.String()
				break
			}
		}
		if cover == "" {
			for _, image := range item.Enclosures {
				if address := feedURL(permalink, image.URL); strings.HasPrefix(image.Type, "image/") && address != nil {
					cover = address.String()
					break
				}
			}
		}
		if cover == "" {
			cover = feedHTMLCover(permalink, item.Encoded, item.Content, item.Description, item.Summary)
		}
		id := strings.TrimSpace(item.GUID)
		if id == "" {
			id = strings.TrimSpace(item.ID)
		}
		if id == "" {
			id = permalink.String()
		}
		runes := []rune(title)
		feed.articles = append(feed.articles, FriendArticle{Title: string(runes[:min(500, len(runes))]), URL: permalink.String(), PublishedAt: published, Cover: cover, entryID: id})
	}
	if feed.latest.IsZero() {
		return feed, errors.New("RSS/Atom 中没有有效的文章时间")
	}
	sort.SliceStable(feed.articles, func(i, j int) bool { return feed.articles[i].PublishedAt.After(feed.articles[j].PublishedAt) })
	seen := map[string]bool{}
	seenIDs := map[string]bool{}
	articles := feed.articles[:0]
	for _, article := range feed.articles {
		if !seen[article.URL] && !seenIDs[article.entryID] {
			seen[article.URL] = true
			seenIDs[article.entryID] = true
			articles = append(articles, article)
		}
		if len(articles) == FriendArticleLimit {
			break
		}
	}
	feed.articles = articles
	return feed, nil
}

func (s Store) readFriendFeed(ctx context.Context, address string) (feedSnapshot, error) {
	own, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if s.ReadFeed != nil {
		stamp, err := s.ReadFeed(own, address)
		if err == nil && stamp.IsZero() {
			err = errors.New("RSS 没有有效文章时间")
		}
		return feedSnapshot{latest: stamp}, err
	}
	return fetchFriendFeed(own, address, nil)
}

func fetchFriendFeed(ctx context.Context, address string, client *http.Client) (feedSnapshot, error) {
	response, err := publicfetch.FetchResponse(ctx, address, client, 4<<20, "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5")
	if err != nil {
		return feedSnapshot{}, err
	}
	return parseFeed(response.Data, response.URL)
}
