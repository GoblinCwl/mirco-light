package comments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Client struct {
	Settings     func(context.Context) (map[string]any, error)
	HTTP         *http.Client
	Sessions     *SessionStore
	CaptchaReset func() time.Duration
	Now          func() time.Time
	scope        string
	mu           sync.Mutex
	key, token   string
	browser      *Client
}

// BrowserSession creates a separate login for an authenticated site administrator.
// Never return configured passwords or the backend client's cached token.
func (c *Client) BrowserSession(ctx context.Context) (map[string]any, error) {
	_, credentials, _, err := c.configuration(ctx)
	if err != nil {
		return nil, err
	}
	if credentials["email"] == "" || credentials["password"] == "" {
		return nil, errors.New("评论管理员认证尚未配置")
	}
	// Reuse the dedicated browser login across page loads. Repeated password
	// exchanges can hit Artalk's login rate limit; Do refreshes expired tokens.
	c.mu.Lock()
	if c.Sessions == nil {
		c.Sessions = &SessionStore{}
	}
	if c.browser == nil {
		c.browser = &Client{Settings: c.Settings, HTTP: c.HTTP, Sessions: c.Sessions, CaptchaReset: c.CaptchaReset, Now: c.Now, scope: "browser"}
	}
	browser := c.browser
	c.mu.Unlock()
	// User lookup can return HTTP 200 and an administrator profile even when
	// the bearer token has expired. Probe a guarded endpoint before issuing it.
	if _, err := browser.Do(ctx, "/api/v2/pages?limit=1", true, "GET", nil); err != nil {
		return nil, err
	}
	profile, err := browser.Do(ctx, "/api/v2/user?email="+url.QueryEscape(text(credentials["email"])), true, "GET", nil)
	if err != nil {
		return nil, err
	}
	user := object(profile["user"])
	if user["is_admin"] != true {
		return nil, errors.New("评论账号不是管理员")
	}
	browser.mu.Lock()
	token := browser.token
	browser.mu.Unlock()
	return map[string]any{"token": token, "user": map[string]any{
		"name": text(user["name"]), "email": text(user["email"]), "link": text(user["link"]), "is_admin": true,
	}}, nil
}

func text(value any) string           { v, _ := value.(string); return v }
func object(value any) map[string]any { v, _ := value.(map[string]any); return v }
func list(value any) []any            { v, _ := value.([]any); return v }
func str(values map[string]any, key, fallback string) string {
	if v := text(values[key]); v != "" {
		return v
	}
	return fallback
}

type responseError struct {
	status    int
	captcha   bool
	needLogin bool
}

func (e *responseError) Error() string {
	if e.captcha {
		return "评论认证需要验证码"
	}
	return "评论服务暂不可用"
}

type captchaCooldown struct {
	until  time.Time
	manual bool
}

func (e *captchaCooldown) Error() string {
	if e.manual {
		return "评论认证需要人工完成验证码，已暂停自动登录"
	}
	return fmt.Sprintf("评论认证需要验证码，暂停登录至 %s", e.until.In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05"))
}
func (c *Client) now() time.Time {
	if c.Now != nil {
		return c.Now()
	}
	return time.Now()
}
func (c *Client) sessionScope() string {
	if c.scope != "" {
		return c.scope
	}
	return "backend"
}
func (c *Client) request(ctx context.Context, base, path, method, token string, body any) (map[string]any, int, error) {
	var input io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		input = strings.NewReader(string(raw))
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, method, base+path, input)
	if err != nil {
		return nil, 0, err
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "Artalk", request)
	if err != nil {
		return nil, 0, errors.New("评论服务暂不可用")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 16<<20+1))
	if err != nil || len(raw) > 16<<20 {
		return nil, response.StatusCode, errors.New("评论服务响应无效")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var value map[string]any
		_ = json.Unmarshal(raw, &value)
		captcha := value["need_captcha"] == true || object(value["data"])["need_captcha"] == true
		needLogin := value["need_login"] == true || object(value["data"])["need_login"] == true
		return nil, response.StatusCode, &responseError{status: response.StatusCode, captcha: captcha, needLogin: needLogin}
	}
	if len(raw) == 0 {
		return map[string]any{}, response.StatusCode, nil
	}
	var value map[string]any
	if json.Unmarshal(raw, &value) != nil || value == nil {
		return nil, response.StatusCode, errors.New("评论服务响应无效")
	}
	return value, response.StatusCode, nil
}
func (c *Client) configuration(ctx context.Context) (string, map[string]any, string, error) {
	values, err := c.Settings(ctx)
	if err != nil {
		return "", nil, "", err
	}
	base := strings.TrimRight(str(values, "api.artalk.url", "http://artalk:23366"), "/")
	credentials := map[string]any{"email": text(values["api.artalk.email"]), "password": text(values["api.artalk.password"])}
	raw, _ := json.Marshal([]any{base, credentials})
	hash := sha256.Sum256(raw)
	return base, credentials, hex.EncodeToString(hash[:]), nil
}
func (c *Client) authenticate(ctx context.Context, base string, credentials map[string]any, key string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.key == key && c.token != "" {
		return c.token, nil
	}
	if credentials["email"] == "" || credentials["password"] == "" {
		return "", errors.New("评论管理员认证尚未配置")
	}
	if c.Sessions == nil {
		c.Sessions = &SessionStore{}
	}
	sessions := c.Sessions
	sessions.mu.Lock()
	defer sessions.mu.Unlock()
	if err := sessions.load(); err != nil {
		return "", err
	}
	if saved := sessions.state.Sessions[c.sessionScope()]; saved.Key == key && saved.Token != "" {
		c.key, c.token = key, saved.Token
		return c.token, nil
	}
	if sessions.state.BlockedKey == key && (sessions.state.BlockedForever || c.now().Before(sessions.state.BlockedUntil)) {
		return "", &captchaCooldown{sessions.state.BlockedUntil, sessions.state.BlockedForever}
	}
	value, _, err := c.request(ctx, base, "/api/v2/user/access_token", "POST", "", credentials)
	if err != nil {
		var response *responseError
		if errors.As(err, &response) && response.status == 403 && response.captcha {
			delay := time.Minute
			if c.CaptchaReset != nil {
				delay = c.CaptchaReset()
			}
			sessions.state.BlockedForever = delay < 0
			if delay < time.Second {
				delay = time.Second
			}
			sessions.state.BlockedKey = key
			sessions.state.BlockedUntil = c.now().Add(delay)
			if saveErr := sessions.save(); saveErr != nil {
				return "", saveErr
			}
			return "", &captchaCooldown{sessions.state.BlockedUntil, sessions.state.BlockedForever}
		}
		return "", err
	}
	token := text(value["token"])
	if token == "" {
		return "", errors.New("评论管理员认证不可用")
	}
	c.key, c.token = key, token
	sessions.state.Sessions[c.sessionScope()] = cachedSession{key, token}
	sessions.state.BlockedKey = ""
	sessions.state.BlockedUntil = time.Time{}
	sessions.state.BlockedForever = false
	if err := sessions.save(); err != nil {
		return "", err
	}
	return token, nil
}
func (c *Client) Do(ctx context.Context, path string, authenticated bool, method string, body any) (map[string]any, error) {
	base, credentials, key, err := c.configuration(ctx)
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 2; attempt++ {
		token := ""
		if authenticated {
			token, err = c.authenticate(ctx, base, credentials, key)
			if err != nil {
				return nil, err
			}
		}
		value, status, err := c.request(ctx, base, path, method, token, body)
		var response *responseError
		loginRequired := status == 401 || status == 403 && errors.As(err, &response) && response.needLogin && !response.captcha
		if authenticated && loginRequired {
			c.mu.Lock()
			if c.key == key && c.token == token {
				c.token = ""
				if c.Sessions != nil {
					c.Sessions.mu.Lock()
					delete(c.Sessions.state.Sessions, c.sessionScope())
					saveErr := c.Sessions.save()
					c.Sessions.mu.Unlock()
					if saveErr != nil {
						c.mu.Unlock()
						return nil, saveErr
					}
				}
			}
			c.mu.Unlock()
			if attempt == 0 {
				continue
			}
		}
		return value, err
	}
	return nil, errors.New("评论管理员认证不可用")
}
