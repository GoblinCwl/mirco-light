package openlist

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type sessionWork struct {
	done  chan struct{}
	value map[string]any
	err   error
}
type Session struct {
	ReadSettings func(context.Context) (map[string]any, error)
	Client       *http.Client
	mu           sync.Mutex
	key          string
	until        time.Time
	token        string
	user         map[string]any
	pending      map[string]*sessionWork
}

func (s *Session) Get(ctx context.Context) (map[string]any, error) {
	values, err := s.ReadSettings(ctx)
	if err != nil {
		return nil, err
	}
	username, _ := values["openlist.username"].(string)
	password, _ := values["openlist.password"].(string)
	base, _ := values["openlist.url"].(string)
	username = strings.TrimSpace(username)
	if username == "" || password == "" {
		return map[string]any{"configured": false}, nil
	}
	if base == "" {
		base = "http://openlist:5244"
	}
	base = strings.TrimRight(base, "/")
	raw, _ := json.Marshal([]string{base, username, password})
	sum := sha256.Sum256(raw)
	key := hex.EncodeToString(sum[:])
	s.mu.Lock()
	if s.key == key && time.Now().Before(s.until) {
		token, user := s.token, s.user
		s.mu.Unlock()
		return map[string]any{"configured": true, "token": token, "user": user}, nil
	}
	if work := s.pending[key]; work != nil {
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-work.done:
			return copySession(work.value), work.err
		}
	}
	if s.pending == nil {
		s.pending = map[string]*sessionWork{}
	}
	work := &sessionWork{done: make(chan struct{})}
	s.pending[key] = work
	s.mu.Unlock()
	work.value, work.err = s.safeLogin(ctx, base, username, password)
	s.mu.Lock()
	if work.err == nil {
		s.key = key
		s.until = time.Now().Add(10 * time.Minute)
		s.token = work.value["token"].(string)
		s.user, _ = work.value["user"].(map[string]any)
	}
	delete(s.pending, key)
	close(work.done)
	s.mu.Unlock()
	return copySession(work.value), work.err
}
func (s *Session) login(ctx context.Context, base, username, password string) (map[string]any, error) {
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	call := func(path string, input any, token string) (json.RawMessage, error) {
		method := "GET"
		var reader io.Reader
		if input != nil {
			method = "POST"
			raw, _ := json.Marshal(input)
			reader = strings.NewReader(string(raw))
		}
		req, err := http.NewRequestWithContext(ctx, method, base+"/api/"+path, reader)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", token)
		}
		response, err := alerts.Do(client, "OpenList", req)
		if err != nil {
			return nil, errors.New("OpenList 账户登录失败，请检查平台接入配置")
		}
		defer response.Body.Close()
		var result struct {
			Code int             `json:"code"`
			Data json.RawMessage `json:"data"`
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 || json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result) != nil || result.Code != 200 {
			alerts.Emit(alerts.Event{Kind: "api", Level: "warning", Source: "OpenList", Title: "OpenList 账户接入失败", Message: "请检查服务接入中的账户配置", Code: result.Code, Target: base})
			return nil, errors.New("OpenList 账户登录失败，请检查平台接入配置")
		}
		return result.Data, nil
	}
	data, err := call("auth/login", map[string]string{"username": username, "password": password}, "")
	if err != nil {
		return nil, err
	}
	var login struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(data, &login) != nil || login.Token == "" {
		return nil, errors.New("OpenList 未返回登录会话")
	}
	data, err = call("me", nil, login.Token)
	if err != nil {
		return nil, err
	}
	var user struct {
		Role int `json:"role"`
	}
	if json.Unmarshal(data, &user) != nil || user.Role != 2 {
		return nil, errors.New("请配置 OpenList 管理员账户")
	}
	var identity map[string]any
	if err := json.Unmarshal(data, &identity); err != nil {
		return nil, err
	}
	// Only expose fields the client needs to build space paths and actions.
	public := map[string]any{}
	for _, key := range []string{"username", "role", "base_path", "permission"} {
		if value, ok := identity[key]; ok {
			public[key] = value
		}
	}
	return map[string]any{"configured": true, "token": login.Token, "user": public}, nil
}

func copySession(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	out := map[string]any{}
	for key, v := range value {
		out[key] = v
	}
	return out
}

func (s *Session) safeLogin(ctx context.Context, base, username, password string) (value map[string]any, err error) {
	defer func() {
		if recover() != nil {
			value = nil
			err = errors.New("分享账户服务暂时不可用")
		}
	}()
	return s.login(ctx, base, username, password)
}
