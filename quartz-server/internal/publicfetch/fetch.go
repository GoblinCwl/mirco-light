// Package publicfetch downloads untrusted public HTTP resources with bounded size.
package publicfetch

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"time"
)

func PublicIP(ip netip.Addr) bool {
	ip = ip.Unmap()
	return ip.IsGlobalUnicast() && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !netip.MustParsePrefix("100.64.0.0/10").Contains(ip)
}
func safeDial(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		if !PublicIP(ip) {
			return nil, errors.New("远程资源地址不能指向内部网络")
		}
	}
	var last error
	for _, ip := range ips {
		conn, e := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if e == nil {
			return conn, nil
		}
		last = e
	}
	if last == nil {
		last = errors.New("远程资源地址无法解析")
	}
	return nil, last
}
func validURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, errors.New("远程资源地址无效")
	}
	return u, nil
}

type Response struct {
	Data        []byte
	URL         *url.URL
	ContentType string
}

func Fetch(ctx context.Context, address string, client *http.Client, maxSize int64, accept string) ([]byte, error) {
	response, err := FetchResponse(ctx, address, client, maxSize, accept)
	if err != nil {
		return nil, err
	}
	return response.Data, nil
}
func request(ctx context.Context, address string, client *http.Client, accept string, cookies ...*http.Cookie) (*http.Response, error) {
	u, err := validURL(address)
	if err != nil {
		return nil, err
	}
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second, Transport: &http.Transport{DisableKeepAlives: true, DialContext: safeDial, TLSHandshakeTimeout: 5 * time.Second, ResponseHeaderTimeout: 10 * time.Second}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("远程资源重定向过多")
			}
			if _, err := validURL(req.URL.String()); err != nil {
				return err
			}
			if via[0].URL.Scheme == "https" && req.URL.Scheme != "https" {
				return errors.New("远程资源重定向不能降级为 HTTP")
			}
			req.Header.Set("Referer", req.URL.Scheme+"://"+req.URL.Host+"/")
			return nil
		}}
	}
	if len(cookies) > 0 {
		copy := *client
		previous := client.CheckRedirect
		copy.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("远程资源重定向过多")
			}
			if req.URL.Hostname() != u.Hostname() {
				req.Header.Del("Cookie")
			}
			if previous != nil {
				return previous(req, via)
			}
			return nil
		}
		client = &copy
	}
	req, err := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
	if err != nil {
		return nil, err
	}
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	req.Header.Set("Referer", u.Scheme+"://"+u.Host+"/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; MicroLight/1.0)")
	req.Header.Set("Accept", accept)
	res, err := client.Do(req)
	if err != nil {
		return nil, errors.New("下载远程资源失败，请检查资源地址")
	}
	return res, nil
}

func FetchResponse(ctx context.Context, address string, client *http.Client, maxSize int64, accept string) (*Response, error) {
	return FetchResponseWithCookies(ctx, address, client, maxSize, accept, nil)
}

// FetchResponseWithCookies preserves public-address validation and strips cookies on cross-host redirects.
func FetchResponseWithCookies(ctx context.Context, address string, client *http.Client, maxSize int64, accept string, cookies []*http.Cookie) (*Response, error) {
	res, err := request(ctx, address, client, accept, cookies...)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("下载远程资源失败（HTTP %d）", res.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, maxSize+1))
	if err != nil {
		return nil, errors.New("远程资源下载未完成")
	}
	if int64(len(data)) > maxSize {
		return nil, errors.New("远程资源超过大小限制")
	}
	return &Response{Data: data, URL: res.Request.URL, ContentType: res.Header.Get("Content-Type")}, nil
}

// Probe checks homepage reachability without downloading its full document.
func Probe(ctx context.Context, address string, client *http.Client) error {
	res, err := request(ctx, address, client, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("首页请求失败（HTTP %d）", res.StatusCode)
	}
	return nil
}
