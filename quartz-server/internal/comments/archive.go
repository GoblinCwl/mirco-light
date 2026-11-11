package comments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/cache"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Page struct{ Slug, Title, PublicPath string }
type Archive struct {
	Client       *Client
	Site, Origin string
	Pages        func(context.Context) (map[string]Page, error)
	Cache        cache.Cache
}

var emailHash = regexp.MustCompile(`(?i)^[a-f\d]{32}(?:[a-f\d]{32})?$`)
var localDate = regexp.MustCompile(`^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$`)

func limited(v string, max int) string {
	r := []rune(v)
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}
func integer(v any) (int64, bool) {
	n, ok := v.(float64)
	return int64(n), ok && n >= 0 && n <= 9007199254740991 && n == float64(int64(n))
}
func publicKey(slug string) string {
	if slug == "index" {
		return "/"
	}
	return strings.TrimSuffix(slug, "/index")
}
func PublicComment(comment map[string]any, page Page, origin string, gravatar map[string]any) map[string]any {
	id, ok := integer(comment["id"])
	if !ok || id < 1 || comment["is_pending"] != false || comment["visible"] != true {
		return nil
	}
	base, err := url.Parse(strings.TrimRight(origin, "/") + "/")
	if err != nil {
		return nil
	}
	path := page.PublicPath
	if path == "" {
		segments := strings.Split(publicKey(page.Slug), "/")
		for i := range segments {
			segments[i] = url.PathEscape(segments[i])
		}
		path = strings.Join(segments, "/")
	}
	target, err := base.Parse(path)
	if err != nil || target.Scheme != base.Scheme || target.Host != base.Host || target.User != nil {
		return nil
	}
	target.Fragment = "atk-comment-" + strconv.FormatInt(id, 10)
	seed := ""
	avatar := ""
	if hash := text(comment["email_encrypted"]); emailHash.MatchString(hash) {
		seed = strings.ToLower(hash)
		if mirror := text(gravatar["mirror"]); mirror != "" {
			if image, err := url.Parse(strings.TrimRight(mirror, "/") + "/" + hash); err == nil && (image.Scheme == "https" || image.Scheme == "http") && image.Host != "" {
				image.RawQuery = strings.TrimPrefix(text(gravatar["params"]), "?")
				avatar = image.String()
			}
		}
	}
	raw := limited(text(comment["date"]), 50)
	if localDate.MatchString(raw) {
		raw = strings.Replace(raw, " ", "T", 1) + "+08:00"
	}
	var date any
	if at, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		date = at.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	var reply any
	if n, ok := integer(comment["rid"]); ok && n > 0 {
		reply = n
	}
	name := limited(text(comment["nick"]), 100)
	if name == "" {
		name = "访客"
	}
	title := limited(page.Title, 300)
	if title == "" {
		title = publicKey(page.Slug)
	}
	content := text(comment["content_marked"])
	if content == "" {
		content = text(comment["content"])
	}
	badge := text(comment["badge_name"])
	return map[string]any{"id": id, "name": name, "avatar": avatar, "avatarSeed": seed, "isAdmin": badge == "管理员" || badge == "拾光者", "content": limited(content, 30000), "createdAt": date, "replyTo": reply, "pageTitle": title, "url": target.String()}
}
func (a *Archive) collect(ctx context.Context) (map[string]any, error) {
	conf, err := a.Client.Do(ctx, "/api/v2/conf", false, "GET", nil)
	if err != nil {
		return nil, err
	}
	pages, err := a.Pages(ctx)
	if err != nil {
		return nil, err
	}
	comments := map[int64]map[string]any{}
	offset := 0
	for batches := 0; batches < 10000; batches++ {
		query := url.Values{"site_name": {a.Site}, "page_key": {"/"}, "scope": {"site"}, "type": {"all"}, "flat_mode": {"true"}, "limit": {"100"}, "offset": {strconv.Itoa(offset)}, "sort_by": {"date_desc"}}
		value, err := a.Client.Do(ctx, "/api/v2/comments?"+query.Encode(), true, "GET", nil)
		if err != nil {
			return nil, err
		}
		items, ok := value["comments"].([]any)
		count, valid := integer(value["count"])
		if !ok || !valid {
			return nil, errors.New("评论响应无效")
		}
		for _, raw := range items {
			item := object(raw)
			page, ok := pages[text(item["page_key"])]
			if !ok || item["site_name"] != a.Site {
				continue
			}
			if comment := PublicComment(item, page, a.Origin, object(object(conf["frontend_conf"])["gravatar"])); comment != nil {
				comments[comment["id"].(int64)] = comment
			}
		}
		offset += len(items)
		if len(items) == 0 || int64(offset) >= count {
			break
		}
		if batches == 9999 {
			return nil, errors.New("评论数量超出安全范围")
		}
	}
	rows := []map[string]any{}
	for _, comment := range comments {
		if id, ok := comment["replyTo"].(int64); ok {
			if parent := comments[id]; parent != nil && parent["id"] != comment["id"] && strings.Split(text(parent["url"]), "#")[0] == strings.Split(text(comment["url"]), "#")[0] {
				comment["replyTarget"] = map[string]any{"id": parent["id"], "name": parent["name"], "isAdmin": parent["isAdmin"], "url": parent["url"]}
			}
		}
		rows = append(rows, comment)
	}
	sort.Slice(rows, func(i, j int) bool {
		left, right := text(rows[i]["createdAt"]), text(rows[j]["createdAt"])
		if left == right {
			return rows[i]["id"].(int64) > rows[j]["id"].(int64)
		}
		return left > right
	})
	return map[string]any{"comments": rows}, nil
}
func (a *Archive) Load(ctx context.Context, page int) (map[string]any, error) {
	if page < 1 || page > 999999 {
		return nil, errors.New("页码无效")
	}
	value, err := a.Cache.Get(ctx, "archive", time.Minute, false, a.collect)
	if err != nil {
		return nil, err
	}
	rows, ok := value["comments"].([]map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid cached comments")
	}
	start := (page - 1) * 20
	if start > len(rows) {
		start = len(rows)
	}
	end := start + 20
	if end > len(rows) {
		end = len(rows)
	}
	return map[string]any{"comments": rows[start:end], "total": len(rows), "page": page, "pageSize": 20}, nil
}

// DecodeStaticPages omits metadata that has never been publicly indexed.
func DecodeStaticPages(raw []byte) (map[string]Page, error) {
	var values map[string]struct {
		Title      string `json:"title"`
		PublicPath string `json:"publicPath"`
	}
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, err
	}
	out := map[string]Page{}
	for slug, value := range values {
		if strings.HasPrefix(slug, "tags/") || strings.HasPrefix(slug, "comments/") {
			continue
		}
		out[publicKey(slug)] = Page{Slug: slug, Title: value.Title, PublicPath: value.PublicPath}
	}
	return out, nil
}
