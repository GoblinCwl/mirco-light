package buildcontrol

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Client struct{ Directory string }
type Problem struct {
	Status  int
	Message string
}

func (p *Problem) Error() string { return p.Message }
func (c Client) Status() (map[string]any, error) {
	raw, err := os.ReadFile(filepath.Join(c.Directory, "build-status.json"))
	if err != nil {
		return nil, errors.New("构建服务未就绪，请稍后重试")
	}
	if len(raw) > 100000 {
		return nil, errors.New("重载状态过大")
	}
	var value map[string]any
	if err = json.Unmarshal(raw, &value); err != nil || value == nil {
		return nil, errors.New("重载状态无效")
	}
	return value, nil
}
func (c Client) Reload(ctx context.Context, settings map[string]any) (map[string]any, error) {
	raw, err := json.Marshal(map[string]any{"ignorePatterns": settings["content.ignorePatterns"], "unlistedPatterns": settings["content.unlistedPatterns"]})
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", filepath.Join(c.Directory, "quartz-build.sock"))
	}}
	defer transport.CloseIdleConnections()
	request, err := http.NewRequestWithContext(ctx, "POST", "http://quartz-build/reload", strings.NewReader(string(raw)))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := (&http.Client{Transport: transport}).Do(request)
	if err != nil {
		return nil, errors.New("构建服务未就绪，请确认 Quartz 以 watch 模式运行")
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 100001))
	if err != nil || len(data) > 100000 {
		return nil, errors.New("重载状态过大或无效")
	}
	var value map[string]any
	if json.Unmarshal(data, &value) != nil || value == nil {
		return nil, errors.New("重载状态无效")
	}
	if response.StatusCode >= 400 {
		message, _ := value["error"].(string)
		if message == "" {
			message = "重载请求失败"
		}
		return nil, &Problem{response.StatusCode, message}
	}
	return value, nil
}
