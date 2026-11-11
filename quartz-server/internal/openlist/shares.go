package openlist

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/cache"
	"goblincwl/quartz-server/internal/comments"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

type Problem struct {
	Status  int
	Message string
}

func (p *Problem) Error() string { return p.Message }

type Shares struct {
	Adapter    *Adapter
	Artalk     *comments.Client
	Site       string
	Settings   func(context.Context) (map[string]any, error)
	Client     *http.Client
	Changed    func(context.Context, string, string)
	IndexCache cache.Cache
	once       sync.Once
	gate       chan struct{}
}

func text(v any) string           { s, _ := v.(string); return s }
func object(v any) map[string]any { m, _ := v.(map[string]any); return m }
func (s *Shares) API(ctx context.Context, endpoint string, body any, token string) (map[string]any, error) {
	settings, err := s.Settings(ctx)
	if err != nil {
		return nil, err
	}
	base := strings.TrimRight(text(settings["openlist.url"]), "/")
	if base == "" {
		base = "http://openlist:5244"
	}
	method := "GET"
	var input io.Reader
	if body != nil {
		method = "POST"
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		input = strings.NewReader(string(raw))
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, method, base+"/api/"+endpoint, input)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", token)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "OpenList", request)
	if err != nil {
		return nil, errors.New("分享服务暂不可用")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 16<<20+1))
	if err != nil || len(raw) > 16<<20 {
		return nil, errors.New("分享服务响应无效")
	}
	var result struct {
		Code    int            `json:"code"`
		Message string         `json:"message"`
		Data    map[string]any `json:"data"`
	}
	if json.Unmarshal(raw, &result) != nil {
		return nil, errors.New("分享服务响应无效")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || result.Code != 200 {
		if response.StatusCode >= 200 && response.StatusCode < 300 && result.Code >= 500 {
			alerts.Emit(alerts.Event{Kind: "api", Source: "OpenList", Title: "分享 API 返回错误", Message: "分享操作未完成，请检查 OpenList 服务日志", Code: result.Code, Target: base})
		}
		message := result.Message
		if message == "" {
			message = "分享操作失败"
		}
		return nil, errors.New(message)
	}
	return result.Data, nil
}
func SharePaths(files any, user map[string]any) ([]string, error) {
	values, ok := files.([]any)
	if !ok || len(values) == 0 {
		return nil, errors.New("请至少设置一个分享路径")
	}
	base := path.Clean(text(user["base_path"]))
	if base == "." {
		base = "/"
	}
	seen := map[string]bool{}
	paths := []string{}
	for _, raw := range values {
		file, ok := raw.(string)
		if !ok || !strings.HasPrefix(file, "/") || strings.Contains(file, "\\") || strings.IndexFunc(file, func(r rune) bool { return r < 32 || r == 127 }) >= 0 {
			return nil, errors.New("分享路径无效")
		}
		for _, part := range strings.Split(file, "/") {
			if part == ".." {
				return nil, errors.New("分享路径无效")
			}
		}
		file = path.Clean(file)
		if base != "/" && file != base && !strings.HasPrefix(file, base+"/") {
			return nil, errors.New("分享路径超出当前账号根目录")
		}
		if seen[file] {
			return nil, errors.New("分享路径不能重复")
		}
		seen[file] = true
		paths = append(paths, file)
	}
	return paths, nil
}
func metadata(value any) (Metadata, error) {
	raw, ok := value.(string)
	if !ok && value != nil {
		encoded, err := json.Marshal(value)
		if err != nil {
			return Metadata{}, err
		}
		raw = string(encoded)
	}
	return ParseMetadata(raw, true)
}
func remark(value Metadata) string { raw, _ := json.MarshalIndent(value, "", "  "); return string(raw) }
func pick(input map[string]any, keys ...string) map[string]any {
	out := map[string]any{}
	for _, key := range keys {
		if value, ok := input[key]; ok {
			out[key] = value
		}
	}
	return out
}
func clone(input map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range input {
		out[k] = v
	}
	return out
}
func (s *Shares) notify(ctx context.Context, before, after string) {
	if s.Changed != nil {
		s.Changed(ctx, before, after)
	}
}
func (s *Shares) Operate(ctx context.Context, operation string, input map[string]any, token string) (map[string]any, error) {
	s.once.Do(func() { s.gate = make(chan struct{}, 1) })
	select {
	case s.gate <- struct{}{}:
		defer func() { <-s.gate }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	id := text(input["id"])
	if (operation != "share-create" || id != "") && !shareID.MatchString(id) {
		return nil, errors.New("无效的分享名")
	}
	ensure := func(id, previous string, m Metadata) (map[string]any, error) {
		return s.Artalk.EnsureShare(ctx, s.Site, id, previous, m.Comment, m.Tags)
	}
	if operation == "share-page" {
		entries, err := s.Adapter.Entries(ctx)
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if entry.Kind == "share" && entry.ID == id {
				return ensure(id, "", Metadata{Tags: entry.Tags, Comment: entry.Comment})
			}
		}
		return nil, &Problem{404, "分享不存在或已失效"}
	}
	if token == "" {
		return nil, &Problem{401, "请先登录"}
	}
	user, err := s.API(ctx, "me", nil, token)
	if err != nil {
		return nil, err
	}
	role, _ := user["role"].(float64)
	permission, _ := user["permission"].(float64)
	if (role != 0 && role != 2) || (role != 2 && (int64(permission)&16384) == 0) {
		return nil, &Problem{403, "无权管理分享"}
	}
	switch operation {
	case "share-create":
		meta, err := metadata(input["remark"])
		if err != nil {
			return nil, err
		}
		meta.SharedAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		files, err := SharePaths(input["files"], user)
		if err != nil {
			return nil, err
		}
		fields := pick(input, "id", "pwd", "expires", "max_accessed", "header", "readme")
		fields["files"] = files
		fields["remark"] = remark(meta)
		created, err := s.API(ctx, "share/create", fields, token)
		if err != nil {
			return nil, err
		}
		createdID := text(created["id"])
		if !shareID.MatchString(createdID) {
			return nil, errors.New("分享服务返回的标识无效")
		}
		if _, err = ensure(createdID, "", meta); err != nil {
			_, rollback := s.API(ctx, "share/delete?id="+url.QueryEscape(createdID), map[string]any{}, token)
			return nil, errors.Join(err, rollback)
		}
		s.notify(ctx, "", "")
		return map[string]any{"code": 200, "data": created}, nil
	case "share-update", "share-delete":
	default:
		return nil, &Problem{404, "操作不存在"}
	}
	current, err := s.API(ctx, "share/get?id="+url.QueryEscape(id), nil, token)
	if err != nil {
		return nil, err
	}
	if aliasPath, exists := input["aliasPath"]; operation == "share-update" && exists {
		if role != 2 {
			return nil, &Problem{403, "无权管理别名"}
		}
		p, ok := aliasPath.(string)
		alias, valid := input["alias"].(string)
		alias = strings.TrimSpace(alias)
		if !ok || !valid {
			return nil, errors.New("别名配置无效")
		}
		meta, err := metadata(current["remark"])
		if err != nil {
			return nil, err
		}
		if meta.Aliases == nil {
			meta.Aliases = map[string]string{}
		}
		if alias == "" {
			delete(meta.Aliases, p)
		} else {
			meta.Aliases[p] = alias
		}
		if p == "/" || !strings.HasPrefix(p, "/") || strings.HasSuffix(p, "/") || len(p) > 2048 || strings.Contains(p, "\\") || strings.IndexFunc(p, func(r rune) bool { return r < 32 || r == 127 }) >= 0 || utf8.RuneCountInString(alias) > 200 || strings.IndexFunc(alias, func(r rune) bool { return r < 32 || r == 127 }) >= 0 {
			return nil, errors.New("别名格式无效")
		}
		for _, part := range strings.Split(strings.TrimPrefix(p, "/"), "/") {
			if part == "" || part == "." || part == ".." {
				return nil, errors.New("别名路径无效")
			}
		}
		meta, err = ParseMetadata(remark(meta), true)
		if err != nil {
			return nil, err
		}
		target, err := s.API(ctx, "fs/get", map[string]any{"path": "/@s/" + id + p, "password": text(input["password"])}, token)
		if err != nil {
			return nil, err
		}
		if target == nil {
			return nil, errors.New("分享文件不存在或无权访问")
		}
		update := clone(current)
		update["id"] = id
		update["new_id"] = id
		update["remark"] = remark(meta)
		if _, err = s.API(ctx, "share/update", update, token); err != nil {
			return nil, err
		}
		s.notify(ctx, "", "")
		return map[string]any{"code": 200, "data": nil}, nil
	}
	if current["creator"] != user["username"] {
		return nil, &Problem{403, "只能编辑自己创建的分享"}
	}
	if operation == "share-delete" {
		if _, err = s.API(ctx, "share/delete?id="+url.QueryEscape(id), map[string]any{}, token); err != nil {
			return nil, err
		}
		s.notify(ctx, "", "")
		return map[string]any{"code": 200, "data": nil}, nil
	}
	next := text(input["new_id"])
	if next == "" {
		next = id
	}
	if !shareID.MatchString(next) {
		return nil, errors.New("无效的分享名")
	}
	files := current["files"]
	if value, exists := input["files"]; exists {
		files, err = SharePaths(value, user)
		if err != nil {
			return nil, err
		}
	}
	oldMeta, err := metadata(current["remark"])
	if err != nil {
		return nil, err
	}
	meta, err := metadata(input["remark"])
	if err != nil {
		return nil, err
	}
	meta.Aliases = oldMeta.Aliases
	if meta.SharedAt == "" {
		meta.SharedAt = oldMeta.SharedAt
	}
	if next != id {
		previous, err := s.Artalk.FindPage(ctx, s.Site, comments.ShareKey(id))
		if err != nil {
			return nil, err
		}
		if previous != nil {
			target, err := s.Artalk.FindPage(ctx, s.Site, comments.ShareKey(next))
			if err != nil {
				return nil, err
			}
			if target != nil && target["id"] != previous["id"] {
				return nil, errors.New("目标分享已有评论，无法自动合并")
			}
		}
	}
	update := pick(input, "pwd", "expires", "max_accessed", "header", "readme", "new_id", "accessed", "disabled", "order_by", "order_direction", "extract_folder")
	update["id"] = id
	update["new_id"] = next
	update["files"] = files
	update["remark"] = remark(meta)
	if _, err = s.API(ctx, "share/update", update, token); err != nil {
		return nil, err
	}
	if _, err = ensure(next, id, meta); err != nil {
		restore := clone(current)
		restore["id"] = next
		restore["new_id"] = id
		_, rollback := s.API(ctx, "share/update", restore, token)
		if rollback != nil {
			return nil, fmt.Errorf("分享评论同步失败，恢复分享配置失败: %w", errors.Join(err, rollback))
		}
		return nil, err
	}
	s.notify(ctx, id, next)
	return map[string]any{"code": 200, "data": nil}, nil
}
