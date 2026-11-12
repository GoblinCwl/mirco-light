package community

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/publicfetch"
	"golang.org/x/text/encoding/htmlindex"
	"golang.org/x/text/transform"
	"io"
	"net/http"
	"regexp"
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

// ParseFeedDate considers article dates only, never channel lastBuildDate.
func ParseFeedDate(data []byte) (time.Time, error) {
	latest, err := parseFeedDate(data)
	var syntax *xml.SyntaxError
	if !errors.As(err, &syntax) || !strings.Contains(syntax.Msg, "invalid character entity") {
		return latest, err
	}
	// Some feeds put bare ampersands or HTML entity names in old descriptions.
	// Escape only those entities, then retain strict XML structure validation.
	return parseFeedDate(escapeFeedAmpersands(data))
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
func parseFeedDate(data []byte) (time.Time, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.CharsetReader = func(label string, input io.Reader) (io.Reader, error) {
		enc, err := htmlindex.Get(label)
		if err != nil {
			return nil, err
		}
		return transform.NewReader(input, enc.NewDecoder()), nil
	}
	var latest time.Time
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return time.Time{}, fmt.Errorf("RSS/Atom 内容无法解析: %w", err)
		}
		start, ok := token.(xml.StartElement)
		if !ok || (start.Name.Local != "item" && start.Name.Local != "entry") {
			continue
		}
		var item struct {
			Published string `xml:"published"`
			Updated   string `xml:"updated"`
			PubDate   string `xml:"pubDate"`
			Date      string `xml:"date"`
		}
		if err := decoder.DecodeElement(&item, &start); err != nil {
			return time.Time{}, fmt.Errorf("RSS/Atom 文章无法解析: %w", err)
		}
		for _, raw := range []string{item.Published, item.Updated, item.PubDate, item.Date} {
			if stamp := feedTime(raw); stamp.After(latest) {
				latest = stamp
			}
		}
	}
	if latest.IsZero() {
		return latest, errors.New("RSS/Atom 中没有有效的文章时间")
	}
	return latest, nil
}
func LatestFeedDate(ctx context.Context, address string, client *http.Client) (time.Time, error) {
	data, err := publicfetch.Fetch(ctx, address, client, 4<<20, "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5")
	if err != nil {
		return time.Time{}, err
	}
	return ParseFeedDate(data)
}
