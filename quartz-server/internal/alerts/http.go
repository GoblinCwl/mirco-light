package alerts

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

// Observes transport outcomes without reading, buffering or replacing bodies.
// Credentials, query strings and resource/session paths are never recorded.
type transport struct {
	base   http.RoundTripper
	source string
}

func (t transport) RoundTrip(req *http.Request) (*http.Response, error) {
	res, err := t.base.RoundTrip(req)
	target := SafeTarget(req.URL.String())
	if err != nil {
		if !errors.Is(req.Context().Err(), context.Canceled) {
			Emit(Event{Kind: "api", Level: APILevel(t.source, target), Source: t.source, Title: "外部 API 连接失败", Message: "请求连接失败或等待响应超时", Target: target})
		}
	} else if res != nil && (res.StatusCode >= 500 || res.StatusCode == 429 || res.StatusCode == 401 || res.StatusCode == 403) {
		level := APILevel(t.source, target)
		if res.StatusCode < 500 {
			level = "warning"
		}
		Emit(Event{Kind: "api", Level: level, Source: t.source, Title: fmt.Sprintf("外部 API 返回 HTTP %d", res.StatusCode), Message: "请求未成功，请检查对应服务或接入配置", Target: target, Code: res.StatusCode})
	}
	return res, err
}
func Do(client *http.Client, source string, req *http.Request) (*http.Response, error) {
	if current.Load() == nil {
		return client.Do(req)
	}
	copy := *client
	base := copy.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	copy.Transport = transport{base: base, source: source}
	return copy.Do(req)
}

func SafeTarget(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host
}
