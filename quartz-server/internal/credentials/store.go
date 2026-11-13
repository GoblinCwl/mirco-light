package credentials

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/secretbox"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Store struct {
	DB       *sql.DB
	Key      []byte
	Client   *http.Client
	GiteaURL func(context.Context) (string, error)
	gitea    sync.Mutex
	github   sync.Mutex
	bilibili sync.Mutex
}

func New(db *sql.DB, keyFile string) (*Store, error) {
	raw, err := os.ReadFile(keyFile)
	if err != nil {
		return nil, err
	}
	key, err := hex.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(key) != 32 {
		return nil, errors.New("invalid credential encryption key")
	}
	return &Store{DB: db, Key: key}, nil
}
func valid(id string) bool { return id == "github" || id == "bilibili" || id == "gitea" }
func (s *Store) Read(ctx context.Context, id string) (string, error) {
	if !valid(id) {
		return "", errors.New("不支持的平台")
	}
	var raw string
	err := s.DB.QueryRowContext(ctx, "SELECT envelope FROM provider_credentials WHERE provider=?", id).Scan(&raw)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var value secretbox.Envelope
	if err = json.Unmarshal([]byte(raw), &value); err != nil {
		return "", err
	}
	return secretbox.Open(value, s.Key, []byte("quartz:provider:"+id))
}
func clean(id, input string) (string, error) {
	if !valid(id) || strings.TrimSpace(input) == "" || len(input) > 16384 || strings.ContainsAny(input, "\r\n\x00") {
		return "", errors.New("请输入有效凭据，不能包含换行")
	}
	value := strings.TrimSpace(input)
	if id == "github" || id == "gitea" {
		value = regexp.MustCompile(`(?i)^Bearer\s+`).ReplaceAllString(value, "")
		if !regexp.MustCompile(`^[A-Za-z0-9_]+$`).MatchString(value) {
			return "", errors.New("Token 格式不正确")
		}
	} else {
		value = regexp.MustCompile(`(?i)^Cookie:\s*`).ReplaceAllString(value, "")
		if !regexp.MustCompile(`(?:^|;\s*)SESSDATA=[^;]+`).MatchString(value) {
			return "", errors.New("Cookie 中需要包含 SESSDATA")
		}
	}
	return value, nil
}
func (s *Store) Import(ctx context.Context, id, value string) error {
	value, err := clean(id, value)
	if err != nil {
		return err
	}
	envelope, err := secretbox.Seal(value, s.Key, []byte("quartz:provider:"+id))
	if err != nil {
		return err
	}
	raw, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	_, err = s.DB.ExecContext(ctx, "INSERT INTO provider_credentials(provider,envelope,status,checked_at) VALUES(?,?,'unchecked',NULL)", id, string(raw))
	return err
}
func (s *Store) Describe(ctx context.Context, id string) (map[string]any, error) {
	if !valid(id) {
		return nil, errors.New("不支持的平台")
	}
	var status string
	var checked *string
	err := s.DB.QueryRowContext(ctx, "SELECT status,checked_at FROM provider_credentials WHERE provider=?", id).Scan(&status, &checked)
	if err == sql.ErrNoRows {
		return map[string]any{"configured": false, "status": "not_configured", "checkedAt": nil}, nil
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{"configured": true, "status": status, "checkedAt": checked}, nil
}
func (s *Store) verify(ctx context.Context, id, value string) (string, string) {
	at := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	target := "https://api.github.com/user"
	if id == "bilibili" {
		target = "https://api.bilibili.com/x/web-interface/nav"
	}
	if id == "gitea" {
		if s.GiteaURL == nil {
			return "unavailable", at
		}
		base, err := s.GiteaURL(ctx)
		if err != nil || strings.TrimSpace(base) == "" {
			return "unavailable", at
		}
		target = strings.TrimRight(base, "/") + "/api/v1/user"
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return "unavailable", at
	}
	if id == "gitea" {
		req.Header.Set("Authorization", "token "+value)
		req.Header.Set("Accept", "application/json")
	} else if id == "github" {
		req.Header.Set("Authorization", "Bearer "+value)
		req.Header.Set("Accept", "application/vnd.github+json")
		req.Header.Set("User-Agent", "Quartz-Stellar")
	} else {
		req.Header.Set("Cookie", value)
		req.Header.Set("User-Agent", "Mozilla/5.0")
		req.Header.Set("Referer", "https://www.bilibili.com/")
	}
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "平台凭据验证", req)
	if err != nil {
		return "unavailable", at
	}
	defer response.Body.Close()
	if response.StatusCode == 401 {
		return "expired", at
	}
	if id == "gitea" {
		if response.StatusCode == 403 {
			return "expired", at
		}
		var user struct {
			ID int64 `json:"id"`
		}
		if response.StatusCode == 200 && json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&user) == nil && user.ID > 0 {
			return "valid", at
		}
		return "unavailable", at
	}
	if id == "github" {
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			return "valid", at
		}
		return "unavailable", at
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		var result struct {
			Code int `json:"code"`
			Data struct {
				Logged bool `json:"isLogin"`
			} `json:"data"`
		}
		if json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result) == nil {
			if result.Code == 0 && result.Data.Logged {
				return "valid", at
			}
			if result.Code == -101 || result.Code == 0 {
				return "expired", at
			}
		}
	}
	return "unavailable", at
}
func (s *Store) Check(ctx context.Context, id string) (map[string]any, error) {
	if !valid(id) {
		return nil, errors.New("不支持的平台")
	}
	var raw string
	err := s.DB.QueryRowContext(ctx, "SELECT envelope FROM provider_credentials WHERE provider=?", id).Scan(&raw)
	if err == sql.ErrNoRows {
		return s.Describe(ctx, id)
	}
	if err != nil {
		return nil, err
	}
	var envelope secretbox.Envelope
	if err = json.Unmarshal([]byte(raw), &envelope); err != nil {
		return nil, err
	}
	value, err := secretbox.Open(envelope, s.Key, []byte("quartz:provider:"+id))
	if err != nil {
		return nil, err
	}
	state, at := s.verify(ctx, id, value)
	_, err = s.DB.ExecContext(ctx, "UPDATE provider_credentials SET status=?,checked_at=? WHERE provider=? AND envelope=?", state, at, id, raw)
	if err != nil {
		return nil, err
	}
	return s.Describe(ctx, id)
}
func (s *Store) Save(ctx context.Context, id, input string) (map[string]any, error) {
	value, err := clean(id, input)
	if err != nil {
		return nil, err
	}
	lock := &s.github
	if id == "bilibili" {
		lock = &s.bilibili
	} else if id == "gitea" {
		lock = &s.gitea
	}
	lock.Lock()
	defer lock.Unlock()
	state, at := s.verify(ctx, id, value)
	if state == "expired" {
		return nil, errors.New("凭据无效或已过期，未替换原配置")
	}
	envelope, err := secretbox.Seal(value, s.Key, []byte("quartz:provider:"+id))
	if err != nil {
		return nil, err
	}
	raw, _ := json.Marshal(envelope)
	_, err = s.DB.ExecContext(ctx, "INSERT INTO provider_credentials(provider,envelope,status,checked_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE envelope=VALUES(envelope),status=VALUES(status),checked_at=VALUES(checked_at)", id, string(raw), state, at)
	if err != nil {
		return nil, err
	}
	return s.Describe(ctx, id)
}
