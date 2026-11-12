package community

import (
	"bytes"
	"context"
	"errors"
	"goblincwl/quartz-server/internal/publicfetch"
	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
	"golang.org/x/net/idna"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
)

type BacklinkResult struct {
	Found   bool
	Message string
}

func reviewHost(u *url.URL, allowWWW bool) string {
	host, err := idna.Lookup.ToASCII(strings.TrimSuffix(strings.ToLower(u.Hostname()), "."))
	if err != nil {
		return ""
	}
	if allowWWW {
		host = strings.TrimPrefix(host, "www.")
	}
	port := u.Port()
	if port != "" && !(port == "80" && u.Scheme == "http") && !(port == "443" && u.Scheme == "https") {
		host += ":" + port
	}
	return host
}
func reviewURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return nil, errors.New("网页地址无效")
	}
	return u, nil
}
func homepageLink(u, site *url.URL) bool {
	if u.User != nil || (u.Scheme != "https" && u.Scheme != "http") || reviewHost(u, false) != reviewHost(site, false) {
		return false
	}
	return path.Clean("/"+strings.TrimPrefix(u.Path, "/")) == path.Clean("/"+strings.TrimPrefix(site.Path, "/"))
}
func attr(n *html.Node, key string) string {
	for _, a := range n.Attr {
		if a.Key == key {
			return a.Val
		}
	}
	return ""
}
func inert(n *html.Node) bool {
	if n.Type != html.ElementNode {
		return false
	}
	switch n.Data {
	case "script", "style", "template", "noscript", "iframe":
		return true
	}
	for _, a := range n.Attr {
		if a.Key == "hidden" || a.Key == "inert" || a.Key == "aria-hidden" && strings.EqualFold(a.Val, "true") {
			return true
		}
	}
	style := strings.ToLower(strings.ReplaceAll(attr(n, "style"), " ", ""))
	return strings.Contains(style, "display:none") || strings.Contains(style, "visibility:hidden")
}
func pageBacklink(data []byte, contentType string, page, site *url.URL) (bool, error) {
	reader, err := charset.NewReader(bytes.NewReader(data), contentType)
	if err != nil {
		return false, errors.New("网页编码无法识别")
	}
	root, err := html.Parse(reader)
	if err != nil {
		return false, errors.New("网页内容无法解析")
	}
	base := page
	// Only the first base href affects links in HTML.
	var findBase func(*html.Node) bool
	findBase = func(n *html.Node) bool {
		if inert(n) {
			return false
		}
		if n.Type == html.ElementNode && n.Data == "base" {
			for _, a := range n.Attr {
				if a.Key == "href" {
					if u, e := url.Parse(strings.TrimSpace(a.Val)); e == nil {
						base = page.ResolveReference(u)
					}
					return true
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if findBase(c) {
				return true
			}
		}
		return false
	}
	findBase(root)
	var visit func(*html.Node) bool
	visit = func(n *html.Node) bool {
		if inert(n) {
			return false
		}
		if source, ok := markdownSource(n); ok && markdownBacklink(source, base, site, true) {
			return true
		}
		if n.Type == html.ElementNode && n.Data == "a" {
			if href := strings.TrimSpace(attr(n, "href")); href != "" {
				if u, e := url.Parse(href); e == nil && homepageLink(base.ResolveReference(u), site) {
					return true
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if visit(c) {
				return true
			}
		}
		return false
	}
	return visit(root), nil
}

// CheckBacklink performs a bounded, public-network HTML read. JavaScript is not executed.
func CheckBacklink(ctx context.Context, friend Friend, origin string, client *http.Client) (BacklinkResult, error) {
	site, err := reviewURL(origin)
	if err != nil {
		return BacklinkResult{}, errors.New("本站地址未正确配置")
	}
	website, err := reviewURL(friend.URL)
	if err != nil {
		return BacklinkResult{}, err
	}
	page, err := reviewURL(friend.BacklinkURL)
	if err != nil {
		return BacklinkResult{}, err
	}
	if reviewHost(page, true) != reviewHost(website, true) {
		return BacklinkResult{Message: "友链页面不属于申请网站，请人工审核"}, nil
	}
	if reviewHost(website, true) == reviewHost(site, true) {
		return BacklinkResult{Message: "不能使用本站页面作为对方友链证明，请人工审核"}, nil
	}
	response, err := publicfetch.FetchResponse(ctx, page.String(), client, 4<<20, "text/html,application/xhtml+xml;q=0.9")
	if err != nil {
		return BacklinkResult{}, err
	}
	if reviewHost(response.URL, true) != reviewHost(website, true) {
		return BacklinkResult{Message: "友链页面跳转到了其他网站，请人工审核"}, nil
	}
	mediaType, _, _ := mime.ParseMediaType(response.ContentType)
	if mediaType == "" {
		mediaType, _, _ = mime.ParseMediaType(http.DetectContentType(response.Data))
	}
	if mediaType != "text/html" && mediaType != "application/xhtml+xml" {
		return BacklinkResult{Message: "友链地址未返回网页，请人工审核"}, nil
	}
	found, err := pageBacklink(response.Data, response.ContentType, response.URL, site)
	if err != nil {
		return BacklinkResult{}, err
	}
	if found {
		return BacklinkResult{Found: true, Message: "已检测到指向本站的友链，自动审核通过"}, nil
	}
	return BacklinkResult{Message: "网页中未检测到本站友链，保留待审核；动态页面可人工审核"}, nil
}
