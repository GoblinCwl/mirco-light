package video

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Social struct {
	Store  Store
	Client *Client
	mu     sync.Mutex
}

func (s *Social) Refresh(ctx context.Context, force bool) error {
	if !s.mu.TryLock() {
		return nil
	}
	defer s.mu.Unlock()
	meta, err := s.Store.Meta(ctx)
	if err != nil {
		return err
	}
	previous := object(parse(meta["social_status"], nil))
	if !force {
		if at, err := time.Parse(time.RFC3339Nano, text(previous["attemptedAt"])); err == nil && time.Since(at) < 30*time.Minute {
			return nil
		}
	}
	cookie := ""
	if s.Client.Cookie != nil {
		cookie, err = s.Client.Cookie(ctx)
		if err != nil {
			return err
		}
	}
	credential := "not_configured"
	if cookie != "" {
		credential = "unavailable"
		result, err := s.Client.request(ctx, "https://api.bilibili.com/x/web-interface/nav", cookie, "")
		if err == nil {
			credential = "expired"
			if result["code"] == float64(0) && object(result["data"])["isLogin"] == true {
				credential = "valid"
			}
		}
	}
	failures := []string{}
	profile, err := s.Client.Profile(ctx, cookie)
	if err == nil {
		if source := text(profile["avatar"]); source != "" {
			if err = s.image(ctx, source); err != nil {
				failures = append(failures, "头像同步失败，保留缓存")
			}
		}
		if err = s.Store.Put(ctx, "profile", profile); err != nil {
			return err
		}
	} else {
		failures = append(failures, "用户资料同步失败，保留缓存")
	}
	activities, err := s.Client.Activities(ctx, cookie)
	if err == nil {
		if err = s.Store.Put(ctx, "activities", activities); err != nil {
			return err
		}
	} else {
		failures = append(failures, "动态同步失败，保留缓存")
	}
	var message any
	if len(failures) > 0 {
		message = strings.Join(failures, "; ")
	}
	if err = s.Store.Put(ctx, "social_status", map[string]any{"attemptedAt": stamp(), "credential": credential, "error": message}); err != nil {
		return err
	}
	if len(failures) > 0 {
		return errors.New("视频用户信息未完整同步，保留缓存")
	}
	return nil
}
func (s *Social) image(ctx context.Context, source string) error {
	target, err := url.Parse(source)
	if err != nil || target.Scheme != "https" || target.User != nil || target.Port() != "" {
		return errors.New("invalid avatar origin")
	}
	host := target.Hostname()
	if host != "hdslb.com" && !strings.HasSuffix(host, ".hdslb.com") && host != "bilibili.com" && !strings.HasSuffix(host, ".bilibili.com") {
		return errors.New("invalid avatar origin")
	}
	var previous, etag *string
	err = s.Store.DB.QueryRowContext(ctx, "SELECT source,etag FROM video_assets WHERE name='avatar'").Scan(&previous, &etag)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "GET", source, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")
	if previous != nil && *previous == source && etag != nil {
		req.Header.Set("If-None-Match", *etag)
	}
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := alerts.Do(client, "Bilibili", req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == 304 && previous != nil {
		return nil
	}
	if response.StatusCode != 200 {
		return errors.New("avatar upstream unavailable")
	}
	kind, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil {
		return err
	}
	allowed := false
	for _, v := range []string{"image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"} {
		if kind == v {
			allowed = true
		}
	}
	if !allowed {
		return errors.New("invalid avatar type")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024+1))
	if err != nil {
		return err
	}
	if len(data) == 0 || len(data) > 2*1024*1024 {
		return errors.New("avatar exceeds size limit")
	}
	hash := sha256.Sum256(data)
	_, err = s.Store.DB.ExecContext(ctx, "INSERT INTO video_assets(name,source,etag,mime,hash,data) VALUES('avatar',?,?,?,?,?) ON DUPLICATE KEY UPDATE source=VALUES(source),etag=VALUES(etag),mime=VALUES(mime),hash=VALUES(hash),data=VALUES(data)", source, response.Header.Get("ETag"), kind, hex.EncodeToString(hash[:]), data)
	return err
}
