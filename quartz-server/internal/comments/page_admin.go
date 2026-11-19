package comments

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type PageTarget struct {
	Key, Title, URL string
	AdminOnly       bool
}

var pageKeyAttribute = regexp.MustCompile(`data-page-key="([^"]+)"`)
var pageTitleAttribute = regexp.MustCompile(`data-page-title="([^"]*)"`)

func pageURL(origin, route string) (*url.URL, error) {
	base, err := url.Parse(origin)
	if err != nil {
		return nil, errors.New("站点地址无效")
	}
	raw := strings.TrimSpace(route)
	if !strings.HasPrefix(raw, "/") && !strings.Contains(raw, ":") {
		raw = "/" + raw
	}
	target, err := base.Parse(raw)
	if err != nil || target.Scheme != base.Scheme || target.Host != base.Host || target.User != nil || target.RawQuery != "" || target.Fragment != "" {
		return nil, errors.New("请填写本站文章路径或完整地址，不含查询参数和锚点")
	}
	path := strings.Trim(target.Path, "/")
	for _, part := range strings.Split(path, "/") {
		if part == "." || part == ".." || strings.ContainsAny(part, "\\\x00\r\n") {
			return nil, errors.New("文章路径无效")
		}
	}
	return target, nil
}

// ResolveArticle reads the published comment identity, including aliases and encrypted pages.
func ResolveArticle(directory, origin, route string) (PageTarget, error) {
	var result PageTarget
	target, err := pageURL(origin, route)
	if err != nil {
		return result, err
	}
	path := strings.Trim(target.Path, "/")
	if path == "" {
		path = "index"
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return result, errors.New("已发布文章暂不可读取")
	}
	defer root.Close()
	var file *os.File
	for _, name := range []string{path + ".html", path + "/index.html", path} {
		file, err = root.Open(name)
		if err == nil {
			info, e := file.Stat()
			if e == nil && info.Mode().IsRegular() {
				break
			}
			file.Close()
			file = nil
		}
	}
	if file == nil || err != nil {
		return result, errors.New("文章不存在或尚未发布")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 8<<20))
	if err != nil {
		return result, errors.New("无法读取文章")
	}
	match := pageKeyAttribute.FindSubmatch(data)
	if len(match) != 2 {
		return result, errors.New("此页面没有本站评论区")
	}
	result.Key = html.UnescapeString(string(match[1]))
	result.URL = target.String()
	if title := pageTitleAttribute.FindSubmatch(data); len(title) == 2 {
		result.Title = html.UnescapeString(string(title[1]))
	}
	result.AdminOnly = strings.Contains(string(data), `data-admin-only="true"`)
	return result, nil
}

// PageResolver matches local dynamic metadata without fetching target pages.
func PageResolver(directory, origin string, pages []PageTarget) func(context.Context, string) (PageTarget, error) {
	indexed := map[string]PageTarget{}
	for _, page := range pages {
		if u, err := pageURL(origin, page.URL); err == nil {
			indexed[strings.Trim(u.Path, "/")] = page
		}
	}
	return func(_ context.Context, route string) (PageTarget, error) {
		u, err := pageURL(origin, route)
		if err != nil {
			return PageTarget{}, err
		}
		path := strings.Trim(u.Path, "/")
		kind := strings.Split(path, "/")[0]
		if kind != "Repo" && kind != "Video" && kind != "Share" {
			return ResolveArticle(directory, origin, route)
		}
		if page, ok := indexed[path]; ok {
			return page, nil
		}
		return PageTarget{}, errors.New("内容不存在或当前不可用")
	}
}

func (a *Service) allPages(ctx context.Context) ([]any, error) {
	rows := []any{}
	for offset := 0; offset < 100000; offset += 100 {
		data, err := a.Client.Do(ctx, "/api/v2/pages?"+url.Values{"site_name": {a.Site}, "limit": {"100"}, "offset": {strconv.Itoa(offset)}}.Encode(), true, "GET", nil)
		if err != nil {
			return nil, err
		}
		batch := list(data["pages"])
		for _, raw := range batch {
			if text(object(raw)["site_name"]) == a.Site {
				rows = append(rows, raw)
			}
		}
		total, ok := integer(data["count"])
		if len(batch) == 0 || ok && int64(offset+len(batch)) >= total {
			return rows, nil
		}
	}
	return nil, errors.New("评论文章数量超过读取上限")
}
func (a *Service) pageComments(ctx context.Context, key string) ([]any, error) {
	rows := []any{}
	for offset := 0; offset < 100000; offset += 100 {
		query := url.Values{"site_name": {a.Site}, "page_key": {key}, "scope": {"page"}, "type": {"all"}, "flat_mode": {"true"}, "sort_by": {"date_asc"}, "limit": {"100"}, "offset": {strconv.Itoa(offset)}}
		if key == "" {
			query.Set("scope", "site")
			query.Set("page_key", "/")
		}
		data, err := a.Client.Do(ctx, "/api/v2/comments?"+query.Encode(), true, "GET", nil)
		if err != nil {
			return nil, err
		}
		batch := list(data["comments"])
		for _, raw := range batch {
			row := object(raw)
			if text(row["site_name"]) == a.Site && (key == "" || text(row["page_key"]) == key) {
				rows = append(rows, raw)
			}
		}
		total, ok := integer(data["count"])
		if len(batch) == 0 || ok && int64(offset+len(batch)) >= total {
			return rows, nil
		}
	}
	return nil, errors.New("评论数量超过读取上限")
}
func (a *Service) AdminPages(ctx context.Context, page int, search, filter string) (map[string]any, error) {
	if page < 1 || page > 5000 || len(search) > 500 || (filter != "" && filter != "all" && filter != "normal" && filter != "abnormal") {
		return nil, errors.New("查询条件无效")
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	snapshot, err := a.Cache.Get(ctx, "admin-pages", 10*time.Second, false, func(ctx context.Context) (map[string]any, error) {
		pages, err := a.allPages(ctx)
		if err != nil {
			return nil, err
		}
		comments, err := a.pageComments(ctx, "")
		if err != nil {
			return nil, err
		}
		counts := map[string]int{}
		for _, raw := range comments {
			counts[text(object(raw)["page_key"])]++
		}
		items := []any{}
		for _, raw := range pages {
			row := object(raw)
			count := counts[text(row["key"])]
			if count == 0 {
				continue
			}
			item := pick(row, "id", "key", "title", "site_name", "admin_only")
			item["comment_count"] = count
			items = append(items, item)
		}
		return map[string]any{"items": items}, nil
	})
	if err != nil {
		return nil, err
	}
	resolve := a.ResolvePage
	if a.LoadPageResolver != nil {
		resolve, err = a.LoadPageResolver(ctx)
		if err != nil {
			return nil, err
		}
	}
	items := []any{}
	search = strings.ToLower(strings.TrimSpace(search))
	for _, raw := range list(snapshot["items"]) {
		source := object(raw)
		if !strings.Contains(strings.ToLower(text(source["title"])+" "+text(source["key"])), search) {
			continue
		}
		item := pick(source, "id", "key", "title", "site_name", "admin_only", "comment_count")
		normal := false
		if resolve != nil {
			target, err := resolve(ctx, text(item["key"]))
			if err == nil {
				item["url"] = target.URL
				item["expected_key"] = target.Key
				normal = target.Key == text(item["key"])
				if normal {
					item["status"] = "正常"
				} else {
					item["status"] = "评论路由不一致"
				}
			} else {
				item["status"] = err.Error()
			}
		} else {
			item["status"] = "文章检测尚未配置"
		}
		item["normal"] = normal
		if filter == "normal" && !normal || filter == "abnormal" && normal {
			continue
		}
		items = append(items, item)
	}
	total := len(items)
	start := min((page-1)*adminPageSize, total)
	end := min(start+adminPageSize, total)
	return map[string]any{"items": items[start:end], "total": total, "page": page, "pageSize": adminPageSize}, nil
}

func (a *Service) MovePage(ctx context.Context, id int64, input map[string]any) error {
	if id < 1 || len(input) != 2 || a.ResolvePage == nil {
		return errors.New("文章路由参数无效")
	}
	expected, ok := input["old_key"].(string)
	if !ok || expected == "" {
		return errors.New("原文章路由无效")
	}
	route, ok := input["route"].(string)
	if !ok || len(route) > 2000 {
		return errors.New("新文章路由无效")
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	a.pageMu.Lock()
	defer a.pageMu.Unlock()
	defer a.Cache.Invalidate()
	pages, err := a.allPages(ctx)
	if err != nil {
		return err
	}
	var source map[string]any
	for _, raw := range pages {
		row := object(raw)
		n, _ := integer(row["id"])
		if n == id {
			source = row
			break
		}
	}
	if source == nil || text(source["key"]) != expected {
		return errors.New("原文章不存在或路由已变化，请刷新列表")
	}
	target, err := a.ResolvePage(ctx, route)
	if err != nil {
		return err
	}
	if target.Key == expected {
		return errors.New("新旧文章评论路由相同")
	}
	title := target.Title
	if title == "" {
		title = text(source["title"])
	}
	comments, err := a.pageComments(ctx, expected)
	if err != nil {
		return err
	}
	if len(comments) == 0 {
		return errors.New("原文章已没有评论，请刷新列表")
	}
	// Validate every full record before writing; use individual updates to support an existing destination.
	records := []map[string]any{}
	for _, raw := range comments {
		n, ok := integer(object(raw)["id"])
		if !ok || n < 1 {
			return errors.New("评论编号无效")
		}
		value, err := a.Client.Do(ctx, fmt.Sprintf("/api/v2/comments/%d", n), true, "GET", nil)
		if err != nil {
			return err
		}
		row := object(value["comment"])
		if text(row["site_name"]) != a.Site || text(row["page_key"]) != expected {
			return errors.New("评论归属已变化，请刷新重试")
		}
		records = append(records, row)
	}
	sort.Slice(records, func(i, j int) bool {
		a, _ := integer(records[i]["id"])
		b, _ := integer(records[j]["id"])
		return a < b
	})
	value, err := a.Client.Do(ctx, "/api/v2/pages/pv", false, "POST", map[string]any{"site_name": a.Site, "page_key": target.Key, "page_title": title})
	if err != nil {
		return err
	}
	_ = value
	// Preserve destination policy; a newly created page must follow the published article policy.
	dest, err := a.Client.FindPage(ctx, a.Site, target.Key)
	if err != nil {
		return err
	}
	if dest == nil {
		return errors.New("目标评论页面未就绪")
	}
	destID, ok := integer(dest["id"])
	if !ok || destID < 1 {
		return errors.New("目标页面编号无效")
	}
	if _, err = a.Client.Do(ctx, fmt.Sprintf("/api/v2/pages/%d", destID), true, "PUT", map[string]any{"site_name": a.Site, "key": target.Key, "title": title, "admin_only": target.AdminOnly}); err != nil {
		return err
	}
	moved := 0
	for _, row := range records {
		n, _ := integer(row["id"])
		payload := pick(row, "content", "is_collapsed", "is_pending", "is_pinned", "page_key", "rid", "site_name", "nick", "email", "link", "ip", "ua")
		payload["page_key"] = target.Key
		if _, err = a.Client.Do(ctx, fmt.Sprintf("/api/v2/comments/%d", n), true, "PUT", payload); err != nil {
			return fmt.Errorf("已迁移 %d 条评论，剩余未完成；刷新列表后可继续重试：%w", moved, err)
		}
		moved++
	}
	return nil
}
