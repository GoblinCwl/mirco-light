package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/openlist"
	"io"
	_ "modernc.org/sqlite"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"
)

type Access struct {
	Path     string
	Password string
	Token    string
}
type Backend struct {
	Library                 *sql.DB
	OpenList                *openlist.Adapter
	Shares                  *openlist.Shares
	Settings                func(context.Context) (map[string]any, error)
	HTTP                    *http.Client
	userMu                  sync.Mutex
	user, userConfiguration string
}

func NewBackend(ctx context.Context, libraryPath string, entries *openlist.Adapter, shares *openlist.Shares, settings func(context.Context) (map[string]any, error)) (*Backend, error) {
	u := url.URL{Scheme: "file", Path: libraryPath}
	q := u.Query()
	q.Set("mode", "ro")
	q.Add("_pragma", "busy_timeout=3000")
	q.Add("_pragma", "temp_store=MEMORY")
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	check, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err = db.PingContext(check); err != nil {
		db.Close()
		return nil, err
	}
	return &Backend{Library: db, OpenList: entries, Shares: shares, Settings: settings}, nil
}
func NormalPath(value string) (string, error) {
	if value == "" || strings.ContainsAny(value, "\x00\\") {
		return "", errors.New("无效的文件路径")
	}
	return path.Join("/", value), nil
}
func Inside(value, parent string) bool {
	return parent == "/" || value == parent || strings.HasPrefix(value, parent+"/")
}
func (b *Backend) PhysicalPath(ctx context.Context, virtual string) (string, error) {
	virtual, err := NormalPath(virtual)
	if err != nil {
		return "", err
	}
	rows, err := b.OpenList.DB.QueryContext(ctx, "SELECT mount_path,driver,addition FROM x_storages WHERE disabled=0 ORDER BY length(mount_path) DESC")
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var mount, driver, addition string
		if err = rows.Scan(&mount, &driver, &addition); err != nil {
			return "", err
		}
		mount, err = NormalPath(mount)
		if err != nil {
			return "", err
		}
		if !Inside(virtual, mount) {
			continue
		}
		if driver != "Local" {
			return "", nil
		}
		var config map[string]any
		if err = json.Unmarshal([]byte(addition), &config); err != nil {
			return "", err
		}
		root, err := NormalPath(text(config["root_folder_path"]))
		if err != nil {
			return "", err
		}
		relative := strings.TrimPrefix(strings.TrimPrefix(virtual, mount), "/")
		return NormalPath(path.Join(root, relative))
	}
	return "", rows.Err()
}
func (b *Backend) ResolveAccess(ctx context.Context, access Access, allowDirectory bool) (string, map[string]any, error) {
	meta, err := b.Shares.API(ctx, "fs/get", map[string]any{"path": access.Path, "password": access.Password}, access.Token)
	if err != nil {
		return "", nil, err
	}
	if meta == nil || meta["is_dir"] == true && !allowDirectory {
		return "", nil, errors.New("无权访问此文件")
	}
	virtual := ""
	if strings.HasPrefix(access.Path, "/@s/") {
		parts := strings.Split(access.Path, "/")
		if len(parts) < 3 || parts[2] == "" {
			return "", nil, errors.New("分享不存在")
		}
		var raw, base string
		err = b.OpenList.DB.QueryRowContext(ctx, "SELECT s.files_raw,u.base_path FROM x_sharing_dbs s JOIN x_users u ON u.id=s.creator_id WHERE s.id=?", parts[2]).Scan(&raw, &base)
		if err == sql.ErrNoRows {
			return "", nil, errors.New("分享不存在")
		} else if err != nil {
			return "", nil, err
		}
		var files []string
		if err = json.Unmarshal([]byte(raw), &files); err != nil {
			return "", nil, err
		}
		source, relative := "", ""
		parts = parts[3:]
		if len(files) == 1 {
			source = files[0]
			relative = strings.Join(parts, "/")
		} else {
			if len(parts) == 0 && allowDirectory {
				return "", meta, nil
			}
			if len(parts) > 0 {
				for _, file := range files {
					if path.Base(strings.TrimRight(file, "/")) == parts[0] {
						source = file
						break
					}
				}
				relative = strings.Join(parts[1:], "/")
			}
		}
		if source == "" {
			return "", nil, errors.New("分享文件不存在")
		}
		virtual, err = NormalPath(path.Join(base, source, relative))
		if err != nil {
			return "", nil, err
		}
	} else {
		base := ""
		if access.Token != "" {
			user, err := b.Shares.API(ctx, "me", nil, access.Token)
			if err != nil {
				return "", nil, err
			}
			if user == nil {
				return "", nil, errors.New("账号已失效")
			}
			base = text(user["base_path"])
		} else {
			err = b.OpenList.DB.QueryRowContext(ctx, "SELECT base_path FROM x_users WHERE role=1 AND disabled=0 LIMIT 1").Scan(&base)
			if err == sql.ErrNoRows {
				return "", nil, errors.New("账号已失效")
			} else if err != nil {
				return "", nil, err
			}
		}
		virtual, err = NormalPath(path.Join(base, access.Path))
		if err != nil {
			return "", nil, err
		}
	}
	physical, err := b.PhysicalPath(ctx, virtual)
	return physical, meta, err
}
func (b *Backend) Authorize(ctx context.Context, access Access, allowDirectory bool) (string, error) {
	physical, _, err := b.ResolveAccess(ctx, access, allowDirectory)
	return physical, err
}
func (b *Backend) configuration(ctx context.Context) (string, string, map[string]any, error) {
	values, err := b.Settings(ctx)
	if err != nil {
		return "", "", nil, err
	}
	base := text(values["api.jellyfin.url"])
	if base == "" {
		base = "http://jellyfin:8096"
	}
	base = strings.TrimRight(base, "/")
	token := text(values["api.jellyfin.token"])
	if token == "" {
		err = b.Library.QueryRowContext(ctx, "SELECT AccessToken FROM ApiKeys ORDER BY DateCreated DESC LIMIT 1").Scan(&token)
		if err != nil {
			return "", "", nil, err
		}
	}
	return base, token, values, nil
}
func (b *Backend) request(ctx context.Context, method, endpoint string, body any) (map[string]any, error) {
	value, err := b.requestJSON(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	if value == nil {
		return nil, nil
	}
	m, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("媒体服务响应无效")
	}
	return m, nil
}
func (b *Backend) requestJSON(ctx context.Context, method, endpoint string, body any) (any, error) {
	base, token, _, err := b.configuration(ctx)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	var input io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		input = strings.NewReader(string(raw))
	}
	request, err := http.NewRequestWithContext(ctx, method, base+endpoint, input)
	if err != nil {
		return nil, err
	}
	request.Header.Set("X-Emby-Token", token)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	client := b.HTTP
	if client == nil {
		client = &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "Jellyfin", request)
	if err != nil {
		return nil, errors.New("媒体服务暂不可用")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("媒体服务请求失败（" + numeric(float64(response.StatusCode)) + "）")
	}
	if response.StatusCode == 204 {
		return nil, nil
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 32<<20+1))
	if err != nil || len(raw) > 32<<20 {
		return nil, errors.New("媒体服务响应过大或无效")
	}
	var value any
	if err = json.Unmarshal(raw, &value); err != nil {
		return nil, errors.New("媒体服务响应无效")
	}
	return value, nil
}
func (b *Backend) UserID(ctx context.Context) (string, error) {
	base, token, _, err := b.configuration(ctx)
	if err != nil {
		return "", err
	}
	key := base + token
	b.userMu.Lock()
	defer b.userMu.Unlock()
	if b.user != "" && b.userConfiguration == key {
		return b.user, nil
	}
	value, err := b.requestJSON(ctx, "GET", "/Users", nil)
	if err != nil {
		return "", err
	}
	fallback, admin := "", ""
	for _, raw := range list(value) {
		user := object(raw)
		policy := object(user["Policy"])
		if policy["IsDisabled"] == true {
			continue
		}
		if fallback == "" {
			fallback = text(user["Id"])
		}
		if policy["IsAdministrator"] == true && admin == "" {
			admin = text(user["Id"])
		}
	}
	if admin != "" {
		fallback = admin
	}
	if fallback == "" {
		return "", errors.New("Jellyfin 没有可用的播放账号")
	}
	b.user, b.userConfiguration = fallback, key
	return fallback, nil
}
func NormalizeID(value string) string { return strings.ToLower(strings.ReplaceAll(value, "-", "")) }
func (b *Backend) FindItem(ctx context.Context, physical string) (string, error) {
	var id string
	err := b.Library.QueryRowContext(ctx, "SELECT Id FROM BaseItems WHERE Path=? LIMIT 1", physical).Scan(&id)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return NormalizeID(id), err
}
