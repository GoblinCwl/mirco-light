package comments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
)

const adminPageSize = 20

func pick(value map[string]any, fields ...string) map[string]any {
	out := map[string]any{}
	for _, key := range fields {
		if v, ok := value[key]; ok {
			out[key] = v
		}
	}
	return out
}
func adminUser(value map[string]any, protectedEmail string) map[string]any {
	out := pick(value, "id", "name", "email", "link", "is_admin", "receive_email", "badge_name", "badge_color", "created_at", "last_ip", "last_ua", "comment_count")
	out["protected"] = strings.EqualFold(text(value["email"]), protectedEmail)
	hash := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(text(value["email"])))))
	out["avatarSeed"] = hex.EncodeToString(hash[:])
	return out
}
func (a *Archive) AdminList(ctx context.Context, kind string, page int, search, filter string) (map[string]any, error) {
	if page < 1 || page > 5000 || len(search) > 500 {
		return nil, errors.New("查询条件无效")
	}
	query := url.Values{"limit": {strconv.Itoa(adminPageSize)}, "offset": {strconv.Itoa((page - 1) * adminPageSize)}, "search": {search}}
	path := ""
	switch kind {
	case "comments":
		if filter != "" && filter != "all" && filter != "pending" {
			return nil, errors.New("评论筛选无效")
		}
		if filter == "" {
			filter = "all"
		}
		query.Set("site_name", a.Site)
		query.Set("page_key", "/")
		query.Set("scope", "site")
		query.Set("type", filter)
		query.Set("flat_mode", "true")
		query.Set("sort_by", "date_desc")
		path = "/api/v2/comments"
	case "users":
		if filter != "" && filter != "all" && filter != "admin" {
			return nil, errors.New("用户筛选无效")
		}
		if filter == "" {
			filter = "all"
		}
		path = "/api/v2/users/" + filter
	default:
		return nil, errors.New("管理类型无效")
	}
	value, err := a.Client.Do(ctx, path+"?"+query.Encode(), true, "GET", nil)
	if err != nil {
		return nil, err
	}
	items := []any{}
	_, credentials, _, err := a.Client.configuration(ctx)
	if err != nil {
		return nil, err
	}
	for _, entry := range list(value[kind]) {
		row := object(entry)
		if kind == "users" {
			items = append(items, adminUser(row, text(credentials["email"])))
		} else {
			item := pick(row, "id", "nick", "content", "content_marked", "date", "page_key", "page_url", "rid", "site_name", "is_pending", "is_pinned", "is_collapsed", "user_id")
			item["avatarSeed"] = strings.ToLower(text(row["email_encrypted"]))
			badge := text(row["badge_name"])
			item["isAdmin"] = badge == "管理员" || badge == "拾光者"
			items = append(items, item)
		}
	}
	return map[string]any{"items": items, "total": value["count"], "page": page, "pageSize": adminPageSize}, nil
}
func (a *Archive) findUser(ctx context.Context, id int64) (map[string]any, error) {
	for offset := 0; offset < 100000; offset += 100 {
		value, err := a.Client.Do(ctx, fmt.Sprintf("/api/v2/users/all?limit=100&offset=%d", offset), true, "GET", nil)
		if err != nil {
			return nil, err
		}
		users := list(value["users"])
		for _, entry := range users {
			row := object(entry)
			n, _ := integer(row["id"])
			if n == id {
				return row, nil
			}
		}
		if len(users) < 100 {
			break
		}
	}
	return nil, errors.New("用户不存在")
}
func userInput(input map[string]any) (map[string]any, error) {
	name, email := strings.TrimSpace(text(input["name"])), strings.TrimSpace(text(input["email"]))
	address, err := mail.ParseAddress(email)
	if name == "" || len(name) > 200 || err != nil || address.Address != email || len(email) > 320 {
		return nil, errors.New("请填写有效的昵称和邮箱")
	}
	link := strings.TrimSpace(text(input["link"]))
	if link != "" {
		u, err := url.Parse(link)
		if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, errors.New("网址必须是 HTTP 或 HTTPS 地址")
		}
	}
	out := map[string]any{"name": name, "email": email, "link": link}
	for _, key := range []string{"is_admin", "receive_email"} {
		v, ok := input[key].(bool)
		if !ok {
			return nil, errors.New("用户设置无效")
		}
		out[key] = v
	}
	for _, key := range []string{"badge_name", "badge_color"} {
		v := text(input[key])
		if len(v) > 200 {
			return nil, errors.New("用户徽章过长")
		}
		out[key] = v
	}
	if password := text(input["password"]); password != "" {
		if len(password) < 12 || len(password) > 1024 {
			return nil, errors.New("密码需为 12–1024 个字符")
		}
		out["password"] = password
	}
	return out, nil
}
func (a *Archive) AdminMutate(ctx context.Context, kind, method string, id int64, input map[string]any) error {
	if kind != "comments" && kind != "users" {
		return errors.New("管理类型无效")
	}
	if method != "PUT" && method != "DELETE" && !(kind == "users" && method == "POST") {
		return errors.New("操作无效")
	}
	if method != "POST" && id < 1 {
		return errors.New("记录标识无效")
	}
	path := fmt.Sprintf("/api/v2/%s/%d", kind, id)
	var payload map[string]any
	if kind == "comments" {
		result, err := a.Client.Do(ctx, path, true, "GET", nil)
		if err != nil {
			return err
		}
		current := object(result["comment"])
		if text(current["site_name"]) != a.Site {
			return errors.New("评论不属于本站")
		}
		if method == "PUT" {
			payload = pick(current, "content", "is_collapsed", "is_pending", "is_pinned", "page_key", "rid", "site_name", "nick", "email", "link", "ip", "ua")
			if len(input) == 0 {
				return errors.New("没有可更新的内容")
			}
			for key, value := range input {
				switch key {
				case "content":
					v, ok := value.(string)
					if !ok || strings.TrimSpace(v) == "" || len(v) > 50000 {
						return errors.New("评论正文不能为空或超过 50000 字节")
					}
					payload[key] = v
				case "is_collapsed", "is_pending", "is_pinned":
					v, ok := value.(bool)
					if !ok {
						return errors.New("评论状态无效")
					}
					payload[key] = v
				default:
					return errors.New("不允许修改此评论字段")
				}
			}
		}
	} else {
		_, credentials, _, err := a.Client.configuration(ctx)
		if err != nil {
			return err
		}
		protectedEmail := text(credentials["email"])
		if method != "POST" {
			current, err := a.findUser(ctx, id)
			if err != nil {
				return err
			}
			if strings.EqualFold(text(current["email"]), protectedEmail) {
				return errors.New("本站同步管理员账号受保护，请通过服务接入配置管理")
			}
		}
		if method != "DELETE" {
			payload, err = userInput(input)
			if err != nil {
				return err
			}
			if strings.EqualFold(text(payload["email"]), protectedEmail) {
				return errors.New("不能占用本站同步管理员邮箱")
			}
			if method == "POST" {
				path = "/api/v2/users"
			}
		}
	}
	if _, err := a.Client.Do(ctx, path, true, method, payload); err != nil {
		return err
	}
	a.Cache.Invalidate()
	return nil
}
