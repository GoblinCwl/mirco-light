package adapters

import (
	"context"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"io"
	"net/http"
	"time"
)

// One shared entry and coalesced refresh replace the old Nginx quote cache.
// Never forward browser cookies, Authorization, query strings or API keys.
func (m *Manager) Hitokoto(ctx context.Context) (map[string]any, error) {
	return m.Cache.Get(ctx, "hitokoto", 10*time.Minute, true, func(ctx context.Context) (map[string]any, error) {
		ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, "GET", "https://v1.hitokoto.cn/?encode=json", nil)
		if err != nil {
			return nil, err
		}
		client := m.Client
		if client == nil {
			client = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		}
		response, err := alerts.Do(client, "一言", req)
		if err != nil {
			return nil, errors.New("一言暂时不可用")
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return nil, errors.New("一言暂时不可用")
		}
		raw, err := io.ReadAll(io.LimitReader(response.Body, 65537))
		if err != nil || len(raw) > 65536 {
			return nil, errors.New("一言响应无效")
		}
		var value map[string]any
		if json.Unmarshal(raw, &value) != nil || text(value["hitokoto"]) == "" {
			return nil, errors.New("一言响应无效")
		}
		return value, nil
	})
}
