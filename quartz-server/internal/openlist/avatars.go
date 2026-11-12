package openlist

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/friendavatar"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Avatars writes only content-addressed files under the site's reserved directory.
type Avatars struct {
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
	sum := sha256.Sum256(data)
	name := hex.EncodeToString(sum[:]) + "." + ext
	base, token, err := a.connection(ctx)
	if err != nil {
		return "", err
	}
	if meta, e := a.get(ctx, base, token, friendavatar.Directory+"/"+name); e == nil && meta["is_dir"] == false {
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
