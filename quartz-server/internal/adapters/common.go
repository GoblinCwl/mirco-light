package adapters

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/cache"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type Manager struct {
	napcatMu               sync.Mutex
	napcatKey, napcatToken string
	napcatUntil            time.Time
	DB                     *sql.DB
	Settings               func(context.Context) (map[string]any, error)
	Client                 *http.Client
	Cache                  cache.Cache
	DiaryDirectory         string
}

func (m *Manager) request(ctx context.Context, method, target string, body any, headers map[string]string) (any, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = strings.NewReader(string(raw))
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	client := m.Client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "首页数据源", req)
	if err != nil {
		return nil, errors.New("上游服务暂时不可用")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("上游服务暂时不可用")
	}
	var result any
	if err = json.NewDecoder(io.LimitReader(response.Body, 32<<20)).Decode(&result); err != nil {
		return nil, errors.New("上游响应无效")
	}
	return result, nil
}
func object(value any) map[string]any {
	v, _ := value.(map[string]any)
	if v == nil {
		return map[string]any{}
	}
	return v
}
func list(value any) []any  { v, _ := value.([]any); return v }
func text(value any) string { v, _ := value.(string); return v }
func number(value any) any {
	v, ok := value.(float64)
	if ok && v >= 0 {
		return v
	}
	return nil
}
func timestamp(value any) any {
	v := text(value)
	date, err := time.Parse(time.RFC3339Nano, v)
	if err != nil {
		return nil
	}
	return date.UTC().Format("2006-01-02T15:04:05.000Z")
}
func trimmed(value any, max int) any {
	v, ok := value.(string)
	if !ok {
		return nil
	}
	r := []rune(strings.TrimSpace(v))
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}
func setting(values map[string]any, key, fallback string) string {
	if v := text(values[key]); v != "" {
		return v
	}
	return fallback
}
func (m *Manager) Save(ctx context.Context, name string, value map[string]any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = m.DB.ExecContext(ctx, "INSERT INTO adapter_snapshots(name,value,updated_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_at=VALUES(updated_at)", name, string(raw), time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
	return err
}
func (m *Manager) Saved(ctx context.Context, name string) (map[string]any, error) {
	var raw string
	err := m.DB.QueryRowContext(ctx, "SELECT value FROM adapter_snapshots WHERE name=?", name).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err = json.Unmarshal([]byte(raw), &result); err != nil {
		return nil, err
	}
	return result, nil
}
