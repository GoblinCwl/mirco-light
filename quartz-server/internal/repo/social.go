package repo

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
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
	DB      *sql.DB
	Adapter *Adapter
	mu      sync.Mutex
}

func (s *Social) get(ctx context.Context, key string) (any, error) {
	var raw string
	err := s.DB.QueryRowContext(ctx, "SELECT value FROM repo_snapshots WHERE `key`=?", key).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var value any
	if err = json.Unmarshal([]byte(raw), &value); err != nil {
		return nil, err
	}
	return value, nil
}
func (s *Social) put(ctx context.Context, key string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = s.DB.ExecContext(ctx, "INSERT INTO repo_snapshots(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", key, string(raw))
	return err
}
func (s *Social) Snapshot(ctx context.Context) (map[string]any, error) {
	profile, err := s.get(ctx, "profile")
	if err != nil {
		return nil, err
	}
	activities, err := s.get(ctx, "activities")
	if err != nil {
		return nil, err
	}
	if source, ok := profile.(map[string]any); ok {
		copy := map[string]any{}
		for key, value := range source {
			copy[key] = value
		}
		var hash string
		err = s.DB.QueryRowContext(ctx, "SELECT hash FROM repo_avatar WHERE id=1").Scan(&hash)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		copy["avatar"] = "/static/Profile_compressed.png"
		if hash != "" {
			copy["avatar"] = "/api/repo/avatar?v=" + hash
		}
		profile = copy
	}
	return map[string]any{"profile": profile, "activities": activities}, nil
}
func (s *Social) Avatar(ctx context.Context) (string, string, []byte, error) {
	var mime, hash string
	var data []byte
	err := s.DB.QueryRowContext(ctx, "SELECT mime,hash,data FROM repo_avatar WHERE id=1").Scan(&mime, &hash, &data)
	if err == sql.ErrNoRows {
		return "", "", nil, problem(404, "头像尚未缓存")
	}
	return mime, hash, data, err
}
func (s *Social) image(ctx context.Context, source string) error {
	target, err := url.Parse(source)
	if err != nil || target.Scheme != "https" || target.Hostname() != "avatars.githubusercontent.com" || target.User != nil || target.Port() != "" {
		return errors.New("invalid avatar origin")
	}
	request, err := http.NewRequestWithContext(ctx, "GET", source, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "Quartz-Repo")
	var previous, etag *string
	err = s.DB.QueryRowContext(ctx, "SELECT source,etag FROM repo_avatar WHERE id=1").Scan(&previous, &etag)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if previous != nil && *previous == source && etag != nil {
		request.Header.Set("If-None-Match", *etag)
	}
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := alerts.Do(client, "GitHub", request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode == 304 {
		return nil
	}
	if response.StatusCode != 200 {
		return errors.New("avatar upstream unavailable")
	}
	kind, _, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil {
		return err
	}
	valid := false
	for _, v := range []string{"image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"} {
		if kind == v {
			valid = true
		}
	}
	if !valid {
		return errors.New("invalid avatar format")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, MaxText+1))
	if err != nil {
		return err
	}
	if len(data) == 0 || len(data) > MaxText {
		return errors.New("avatar exceeds limit")
	}
	hash := sha256.Sum256(data)
	_, err = s.DB.ExecContext(ctx, "INSERT INTO repo_avatar(id,source,etag,mime,hash,data) VALUES(1,?,?,?,?,?) ON DUPLICATE KEY UPDATE source=VALUES(source),etag=VALUES(etag),mime=VALUES(mime),hash=VALUES(hash),data=VALUES(data)", source, response.Header.Get("ETag"), kind, hex.EncodeToString(hash[:]), data)
	return err
}
func (s *Social) Refresh(ctx context.Context) error {
	if !s.mu.TryLock() {
		return nil
	}
	defer s.mu.Unlock()
	var first error
	raw, err := s.Adapter.request(ctx, "https://api.github.com/users/"+url.PathEscape(s.Adapter.Owner))
	if err == nil {
		var profile map[string]any
		if json.Unmarshal(raw, &profile) == nil && strings.EqualFold(stringValue(profile["login"]), s.Adapter.Owner) {
			value := map[string]any{}
			for _, key := range []string{"login", "name", "bio", "followers", "following", "public_repos"} {
				value[key] = profile[key]
			}
			if err = s.put(ctx, "profile", value); err == nil {
				if source := stringValue(profile["avatar_url"]); source != "" {
					err = s.image(ctx, source)
				}
			}
		} else {
			err = errors.New("unexpected GitHub profile")
		}
	}
	if err != nil {
		first = err
	}
	years, err := s.years(ctx)
	if err == nil {
		now := time.Now().UTC()
		for _, year := range years {
			key := "contributions:v3:" + itoa(year)
			cached, loadErr := s.get(ctx, key)
			if loadErr != nil {
				err = loadErr
				break
			}
			if previous, ok := cached.(map[string]any); ok && year != now.Year() {
				if at, ok := previous["fetchedAt"].(float64); ok && float64(now.Unix())-at < 86400 {
					continue
				}
			}
			rows, loadErr := s.year(ctx, year)
			if loadErr != nil {
				err = loadErr
				break
			}
			if err = s.put(ctx, key, map[string]any{"fetchedAt": float64(now.UnixNano()) / 1e9, "rows": rows}); err != nil {
				break
			}
			history := []map[string]any{}
			for _, y := range years {
				saved, loadErr := s.get(ctx, "contributions:v3:"+itoa(y))
				if loadErr != nil {
					err = loadErr
					break
				}
				object, _ := saved.(map[string]any)
				if list, ok := object["rows"].([]any); ok {
					for _, row := range list {
						if r, ok := row.(map[string]any); ok {
							history = append(history, r)
						}
					}
				}
			}
			if err != nil {
				break
			}
			sortActivities(history)
			if err = s.put(ctx, "activities", history); err != nil {
				break
			}
		}
		if len(years) == 0 && err == nil {
			err = s.put(ctx, "activities", []any{})
		}
	}
	if first == nil {
		first = err
	}
	statusErr := s.put(ctx, "status", map[string]any{"attemptedAt": time.Now().UTC().Format(time.RFC3339Nano)})
	if first == nil {
		first = statusErr
	}
	return first
}
