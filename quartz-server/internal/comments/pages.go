package comments

import (
	"context"
	"errors"
	"net/url"
	"strconv"
)

func ShareKey(id string) string {
	return "/Share/" + url.PathEscape("分享") + "/" + url.PathEscape(id) + "/"
}
func (c *Client) FindPage(ctx context.Context, site, key string) (map[string]any, error) {
	query := url.Values{"site_name": {site}, "search": {key}, "limit": {"100"}}
	value, err := c.Do(ctx, "/api/v2/pages?"+query.Encode(), true, "GET", nil)
	if err != nil {
		return nil, err
	}
	for _, raw := range list(value["pages"]) {
		page := object(raw)
		if page["key"] == key && page["site_name"] == site {
			return page, nil
		}
	}
	return nil, nil
}
func (c *Client) EnsureShare(ctx context.Context, site, id, previous string, comment bool, tags []string) (map[string]any, error) {
	key := ShareKey(id)
	previousKey := key
	if previous != "" {
		previousKey = ShareKey(previous)
	}
	page, err := c.FindPage(ctx, site, previousKey)
	if err != nil {
		return nil, err
	}
	if previousKey != key && page != nil {
		existing, err := c.FindPage(ctx, site, key)
		if err != nil {
			return nil, err
		}
		if existing != nil && existing["id"] != page["id"] {
			return nil, errors.New("目标分享已有评论，无法自动合并")
		}
	}
	if page == nil {
		if _, err = c.Do(ctx, "/api/v2/pages/pv", false, "POST", map[string]any{"page_key": key, "page_title": id, "site_name": site}); err != nil {
			return nil, err
		}
		page, err = c.FindPage(ctx, site, key)
		if err != nil {
			return nil, err
		}
	}
	if page == nil {
		return nil, errors.New("分享评论页面尚未就绪")
	}
	if page["key"] != key || page["title"] != id || page["admin_only"] != !comment {
		pageID, ok := integer(page["id"])
		if !ok || pageID < 1 {
			return nil, errors.New("评论页面编号无效")
		}
		if _, err = c.Do(ctx, "/api/v2/pages/"+strconv.FormatInt(pageID, 10), true, "PUT", map[string]any{"key": key, "title": id, "site_name": site, "admin_only": !comment}); err != nil {
			return nil, err
		}
	}
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{"key": key, "title": id, "tags": tags, "comment": comment}, nil
}

type Permission struct {
	Key       string `json:"key"`
	Title     string `json:"title"`
	AdminOnly bool   `json:"adminOnly"`
}

func (c *Client) Permission(ctx context.Context, site string, setting Permission) error {
	page, err := c.FindPage(ctx, site, setting.Key)
	if err != nil {
		return err
	}
	if page == nil && setting.AdminOnly {
		if _, err = c.Do(ctx, "/api/v2/pages/pv", false, "POST", map[string]any{"page_key": setting.Key, "page_title": setting.Title, "site_name": site}); err != nil {
			return err
		}
		page, err = c.FindPage(ctx, site, setting.Key)
		if err != nil {
			return err
		}
	}
	if page == nil || page["admin_only"] == setting.AdminOnly {
		return nil
	}
	id, ok := integer(page["id"])
	if !ok || id < 1 {
		return errors.New("评论页面编号无效")
	}
	_, err = c.Do(ctx, "/api/v2/pages/"+strconv.FormatInt(id, 10), true, "PUT", map[string]any{"key": setting.Key, "title": page["title"], "site_name": site, "admin_only": setting.AdminOnly})
	return err
}
