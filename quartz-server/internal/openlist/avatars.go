package openlist

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/friendavatar"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Avatars writes only content-addressed files under the site's reserved directory.
type Avatars struct {
	DB          *sql.DB
	compress    func(context.Context, []byte, int, int) ([]byte, string, string, error)
	Session     *Session
	Settings    func(context.Context) (map[string]any, error)
	Client      *http.Client
	ImageClient *http.Client
}

func (a *Avatars) connection(ctx context.Context) (string, string, error) {
	values, err := a.Settings(ctx)
	if err != nil {
		return "", "", err
	}
	session, err := a.Session.Get(ctx)
	if err != nil {
		return "", "", err
	}
	token, _ := session["token"].(string)
	if token == "" {
		return "", "", errors.New("请先配置 OpenList 管理员账户")
	}
	base := strings.TrimRight(text(values["openlist.url"]), "/")
	if base == "" {
		base = "http://openlist:5244"
	}
	return base, token, nil
}
func (a *Avatars) client() *http.Client {
	if a.Client != nil {
		return a.Client
	}
	return &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func (a *Avatars) call(ctx context.Context, base, token, method, endpoint string, data []byte, headers map[string]string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, method, base+"/api/"+endpoint, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", token)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := a.client().Do(req)
	if err != nil {
		return nil, errors.New("OpenList 头像存储连接失败")
	}
	defer res.Body.Close()
	var result struct {
		Code int            `json:"code"`
		Data map[string]any `json:"data"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&result) != nil || res.StatusCode != 200 || result.Code != 200 {
		return nil, errors.New("OpenList 头像存储操作失败")
	}
	return result.Data, nil
}
func (a *Avatars) get(ctx context.Context, base, token, path string) (map[string]any, error) {
	raw, _ := json.Marshal(map[string]string{"path": path})
	return a.call(ctx, base, token, "POST", "fs/get", raw, nil)
}
func (a *Avatars) Save(ctx context.Context, address string) (string, error) {
	if address == "" || strings.HasPrefix(address, "/static/") || friendavatar.Local(address) {
		return address, nil
	}
	data, mime, ext, err := friendavatar.Fetch(ctx, address, a.ImageClient)
	if err != nil {
		return "", err
	}
	values, err := a.Settings(ctx)
	if err != nil {
		return "", err
	}
	target := friendavatar.DefaultTargetKiB
	if value, ok := values["friends.avatarTargetKiB"].(float64); ok {
		target = int(value)
	}
	memory := friendavatar.DefaultMemoryMiB
	if value, ok := values["friends.avatarMemoryMiB"].(float64); ok {
		memory = int(value)
	}
	base, token, err := a.connection(ctx)
	if err != nil {
		return "", err
	}
	sourceSum := sha256.Sum256(data)
	cacheSum := sha256.Sum256([]byte(fmt.Sprintf("avatar-v2:%x:%d:%d:%s", sourceSum, target, memory, base)))
	cacheKey := hex.EncodeToString(cacheSum[:])
	if a.DB != nil {
		var cached string
		if a.DB.QueryRowContext(ctx, "SELECT filename FROM friend_avatar_cache WHERE cache_key=?", cacheKey).Scan(&cached) == nil && friendavatar.Filename(cached) {
			if meta, e := a.get(ctx, base, token, friendavatar.Directory+"/"+cached); e == nil && meta["is_dir"] == false {
				return friendavatar.Prefix + cached, nil
			}
		}
	}
	compress := a.compress
	if compress == nil {
		compress = func(ctx context.Context, data []byte, target, memory int) ([]byte, string, string, error) {
			return friendavatar.Compress(ctx, data, target, memory)
		}
	}
	data, mime, ext, err = compress(ctx, data, target, memory)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:]) + "." + ext
	remember := func() {
		if a.DB != nil {
			_, _ = a.DB.ExecContext(ctx, "REPLACE INTO friend_avatar_cache(cache_key,filename) VALUES(?,?)", cacheKey, name)
		}
	}
	if meta, e := a.get(ctx, base, token, friendavatar.Directory+"/"+name); e == nil && meta["is_dir"] == false {
		remember()
		return friendavatar.Prefix + name, nil
	}
	for _, directory := range []string{"/Vault/MicroLight", friendavatar.Directory} {
		if meta, e := a.get(ctx, base, token, directory); e == nil && meta["is_dir"] == true {
			continue
		}
		raw, _ := json.Marshal(map[string]string{"path": directory})
		if _, e := a.call(ctx, base, token, "POST", "fs/mkdir", raw, nil); e != nil {
			if meta, e := a.get(ctx, base, token, directory); e != nil || meta["is_dir"] != true {
				return "", errors.New("无法创建 OpenList 头像目录")
			}
		}
	}
	_, err = a.call(ctx, base, token, "PUT", "fs/put", data, map[string]string{"Content-Type": mime, "File-Path": url.PathEscape(friendavatar.Directory + "/" + name), "As-Task": "false", "Overwrite": "false"})
	if err != nil {
		return "", err
	}
	remember()
	return friendavatar.Prefix + name, nil
}
func (a *Avatars) Read(ctx context.Context, name string) ([]byte, string, error) {
	if !friendavatar.Filename(name) {
		return nil, "", errors.New("头像文件不存在")
	}
	base, token, err := a.connection(ctx)
	if err != nil {
		return nil, "", err
	}
	meta, err := a.get(ctx, base, token, friendavatar.Directory+"/"+name)
	if err != nil {
		return nil, "", err
	}
	raw := text(meta["raw_url"])
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, "", errors.New("OpenList 未返回头像下载地址")
	}
	req, err := http.NewRequestWithContext(ctx, "GET", raw, nil)
	if err != nil {
		return nil, "", err
	}
	res, err := a.client().Do(req)
	if err != nil {
		return nil, "", errors.New("读取 OpenList 头像失败")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, "", errors.New("读取 OpenList 头像失败")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, friendavatar.MaxSize+1))
	if err != nil || len(data) > friendavatar.MaxSize {
		return nil, "", errors.New("头像文件无效")
	}
	mime, _, err := friendavatar.MIME(data)
	if err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(data)
	if !strings.HasPrefix(name, hex.EncodeToString(sum[:])+".") {
		return nil, "", errors.New("头像文件校验失败")
	}
	return data, mime, nil
}
