package openlist

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"sync"
)

type Route struct {
	View, Share, Path string
	Valid             bool
}

func ParseRoute(uri string) Route {
	result := Route{View: "guest", Path: "/"}
	if !strings.HasPrefix(uri, "/") || strings.HasPrefix(uri, "//") {
		return result
	}
	u, err := url.Parse(uri)
	if err != nil {
		return result
	}
	escaped := u.EscapedPath()
	if escaped != "/Share" && !strings.HasPrefix(escaped, "/Share/") {
		return result
	}
	raw := ""
	if escaped != "/Share" {
		raw = strings.TrimPrefix(escaped, "/Share/")
	}
	if strings.HasPrefix(raw, "/") || strings.HasSuffix(raw, "//") {
		return result
	}
	raw = strings.TrimSuffix(raw, "/")
	parts := []string{}
	if raw != "" {
		for _, part := range strings.Split(raw, "/") {
			decoded, err := url.PathUnescape(part)
			if err != nil || decoded == "" || decoded == "." || decoded == ".." || strings.ContainsAny(decoded, "/\\") || strings.IndexFunc(decoded, func(c rune) bool { return c < 32 || c == 127 }) >= 0 {
				return result
			}
			parts = append(parts, decoded)
		}
	}
	if len(parts) > 0 {
		switch parts[0] {
		case "空间":
			result.View = "storage"
			parts = parts[1:]
		case "分享":
			if len(parts) < 2 || !shareID.MatchString(parts[1]) {
				return result
			}
			result.View = "share"
			result.Share = parts[1]
			parts = parts[2:]
		case "访客":
			parts = parts[1:]
		}
	}
	if len(parts) > 0 {
		result.Path = "/" + strings.Join(parts, "/")
	}
	result.Valid = true
	return result
}

type File struct {
	Name  string `json:"name"`
	IsDir bool   `json:"is_dir"`
}
type pendingList struct {
	done  chan struct{}
	files []File
	err   error
}
type Routes struct {
	Adapter *Adapter
	BaseURL func(context.Context) (string, error)
	Client  *http.Client
	mu      sync.Mutex
	pending map[string]*pendingList
}

func (r *Routes) list(ctx context.Context, parent string) ([]File, error) {
	r.mu.Lock()
	if work := r.pending[parent]; work != nil {
		r.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-work.done:
			return work.files, work.err
		}
	}
	if r.pending == nil {
		r.pending = map[string]*pendingList{}
	}
	work := &pendingList{done: make(chan struct{})}
	r.pending[parent] = work
	r.mu.Unlock()
	work.files, work.err = r.fetch(ctx, parent)
	r.mu.Lock()
	delete(r.pending, parent)
	close(work.done)
	r.mu.Unlock()
	return work.files, work.err
}
func (r *Routes) fetch(ctx context.Context, parent string) ([]File, error) {
	var token string
	if err := r.Adapter.DB.QueryRowContext(ctx, "SELECT value FROM x_setting_items WHERE key='token'").Scan(&token); err != nil || token == "" {
		return nil, errors.New("分享目录认证不可用")
	}
	base, err := r.BaseURL(ctx)
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(map[string]any{"path": parent, "page": 1, "per_page": 0, "password": "", "refresh": false})
	req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(base, "/")+"/api/fs/list", strings.NewReader(string(raw)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", token)
	response, err := alerts.Do(r.Client, "OpenList", req)
	if err != nil {
		return nil, errors.New("分享目录暂不可用")
	}
	defer response.Body.Close()
	if response.StatusCode == 404 {
		return nil, nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("分享目录暂不可用")
	}
	var result struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			Content json.RawMessage `json:"content"`
		} `json:"data"`
	}
	if err = json.NewDecoder(io.LimitReader(response.Body, 16<<20)).Decode(&result); err != nil {
		return nil, err
	}
	if result.Code == 404 || result.Code == 410 || missing.MatchString(result.Message) {
		return nil, nil
	}
	if result.Code != 200 {
		return nil, errors.New("分享目录暂不可用")
	}
	if string(result.Data.Content) == "null" {
		return []File{}, nil
	}
	var files []File
	if json.Unmarshal(result.Data.Content, &files) != nil || files == nil {
		return nil, errors.New("分享目录响应无效")
	}
	return files, nil
}
func (r *Routes) exists(ctx context.Context, target string) (bool, error) {
	if target == "/" {
		return true, nil
	}
	files, err := r.list(ctx, path.Dir(target))
	if err != nil {
		return false, err
	}
	for _, file := range files {
		if file.Name == path.Base(target) {
			return true, nil
		}
	}
	return false, nil
}
func (r *Routes) Exists(ctx context.Context, uri string) (bool, error) {
	route := ParseRoute(uri)
	if !route.Valid {
		return false, nil
	}
	if route.Path == "/" && (route.View == "guest" || route.View == "storage") {
		return true, nil
	}
	if route.View == "storage" {
		return r.exists(ctx, route.Path)
	}
	if route.View == "guest" {
		var base string
		err := r.Adapter.DB.QueryRowContext(ctx, "SELECT base_path FROM x_users WHERE role=1 AND disabled=0 LIMIT 1").Scan(&base)
		if err == sql.ErrNoRows {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		return r.exists(ctx, path.Join("/", base, route.Path))
	}
	entries, err := r.Adapter.Entries(ctx)
	if err != nil {
		return false, err
	}
	exists := false
	for _, entry := range entries {
		if entry.Kind == "share" && entry.ID == route.Share {
			exists = true
			break
		}
	}
	if !exists {
		return false, nil
	}
	var raw, base string
	err = r.Adapter.DB.QueryRowContext(ctx, "SELECT s.files_raw,u.base_path FROM x_sharing_dbs s JOIN x_users u ON u.id=s.creator_id WHERE s.id=?", route.Share).Scan(&raw, &base)
	if err != nil {
		return false, err
	}
	var sources []string
	if err = json.Unmarshal([]byte(raw), &sources); err != nil {
		return false, err
	}
	if len(sources) == 1 {
		return r.exists(ctx, path.Join("/", base, sources[0], route.Path))
	}
	if route.Path == "/" {
		return true, nil
	}
	parts := strings.Split(strings.TrimPrefix(route.Path, "/"), "/")
	for _, source := range sources {
		if path.Base(strings.TrimSuffix(source, "/")) == parts[0] {
			args := append([]string{"/", base, source}, parts[1:]...)
			return r.exists(ctx, path.Join(args...))
		}
	}
	return false, nil
}

var missing = regexp.MustCompile(`(?i)not found|not a (?:dir(?:ectory)?|folder)|does not exist|doesn.t exist|文件不存在|目录不存在|路径不存在`)
