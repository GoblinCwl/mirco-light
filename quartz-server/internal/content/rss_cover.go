package content

import (
	"bytes"
	"net/url"
	"strings"

	"github.com/yuin/goldmark"
	goldmarkHTML "github.com/yuin/goldmark/renderer/html"
	"golang.org/x/net/html"
)

const rssFallbackCover = "/static/rss-default.png"

// Render only for image discovery, including literal HTML images. Feed markup
// is generated separately from the validated URL and the escaped excerpt.
var rssMarkdown = goldmark.New(goldmark.WithRendererOptions(goldmarkHTML.WithUnsafe()))

func firstRSSImage(source string, resolve func(string) string) string {
	if !strings.Contains(source, "![") && !strings.Contains(strings.ToLower(source), "<img") {
		return ""
	}
	source = encryptedTail.ReplaceAllString(encryptedBlock.ReplaceAllString(source, ""), "")
	var rendered bytes.Buffer
	if rssMarkdown.Convert([]byte(source), &rendered) != nil {
		return ""
	}
	tokenizer := html.NewTokenizer(&rendered)
	var ignored string
	for {
		kind := tokenizer.Next()
		switch kind {
		case html.ErrorToken:
			return ""
		case html.EndTagToken:
			if name, _ := tokenizer.TagName(); ignored == string(name) {
				ignored = ""
			}
		case html.StartTagToken, html.SelfClosingTagToken:
			tag := tokenizer.Token()
			if ignored != "" {
				continue
			}
			switch tag.Data {
			case "code", "pre", "script", "style", "template":
				if kind == html.StartTagToken {
					ignored = tag.Data
				}
			case "img":
				for _, attr := range tag.Attr {
					if attr.Key == "src" {
						if cover := resolve(attr.Val); cover != "" {
							return cover
						}
						break
					}
				}
			}
		}
	}
}

func rssImageReference(raw string) *url.URL {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "#") || strings.HasPrefix(raw, "?") {
		return nil
	}
	ref, err := url.Parse(raw)
	if err != nil || ref.User != nil || ref.Scheme != "" && (!strings.EqualFold(ref.Scheme, "http") && !strings.EqualFold(ref.Scheme, "https") || ref.Host == "") {
		return nil
	}
	return ref
}

func rssImageURL(base, raw string) string {
	ref := rssImageReference(raw)
	root, err := url.Parse(base)
	if ref == nil || err != nil || root.Host == "" {
		return ""
	}
	image := root.ResolveReference(ref)
	if image.Hostname() == "" || image.Path == "" || image.Path == "/" {
		return ""
	}
	return image.String()
}

func itemRSSCover(origin, kind, href string, item Item) string {
	base := strings.TrimRight(origin, "/") + href
	resolve := func(src string) string { return rssImageURL(base, src) }
	if cover, _ := item.Extra["rssCover"].(string); cover != "" {
		if resolved := resolve(cover); resolved != "" {
			return resolved
		}
	}
	switch kind {
	case "article":
		// Quartz has already checked the rendered body and authored summary.
		// Indexed article text can contain markup copied from code blocks.
		return ""
	case "share":
		base = strings.TrimRight(base, "/") + "/"
		if cover := firstRSSImage(item.ReferenceContent, resolve); cover != "" {
			return cover
		}
	case "repo":
		if name, _ := item.Extra["name"].(string); name != "" {
			resolve = func(src string) string {
				ref := rssImageReference(src)
				if ref == nil {
					return ""
				}
				if ref.Scheme != "" || ref.Host != "" {
					return rssImageURL(base, src)
				}
				path := (&url.URL{Path: "/"}).ResolveReference(ref).Path
				if path == "/" || strings.HasSuffix(path, "/") {
					return ""
				}
				query := url.Values{"path": {strings.TrimPrefix(path, "/")}, "ref": {item.EventRevision}}
				return strings.TrimRight(origin, "/") + "/api/repo/" + url.PathEscape(name) + "/raw?" + query.Encode()
			}
		}
	}
	if cover := firstRSSImage(item.Content, resolve); cover != "" {
		return cover
	}
	return firstRSSImage(item.Description, resolve)
}

func rssCoverURL(origin string, record Record) string {
	origin = strings.TrimRight(origin, "/")
	if raw, _ := record.Extra["rssCover"].(string); raw != "" {
		if cover := rssImageURL(origin+record.Href, raw); cover != "" {
			return cover
		}
	}
	return origin + rssFallbackCover
}
