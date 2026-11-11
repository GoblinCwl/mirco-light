package video

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"io"
	"math"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

var bvidPattern = regexp.MustCompile(`^BV[0-9A-Za-z]{10}$`)
var tagsHTML = regexp.MustCompile(`<[^>]*>`)

type APIError struct {
	Code int
	HTTP int
}

func (e *APIError) Error() string {
	if e.HTTP != 0 {
		return fmt.Sprintf("Bilibili HTTP %d", e.HTTP)
	}
	return fmt.Sprintf("Bilibili API %d", e.Code)
}

type Client struct {
	HTTP   *http.Client
	Cookie func(context.Context) (string, error)
	MID    string
}

func (c *Client) request(ctx context.Context, endpoint, cookie, referer string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9")
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "Bilibili", req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, &APIError{HTTP: response.StatusCode}
	}
	var result map[string]any
	decoder := json.NewDecoder(io.LimitReader(response.Body, 16<<20))
	if err = decoder.Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}
func (c *Client) data(ctx context.Context, endpoint, cookie string) (map[string]any, error) {
	result, err := c.request(ctx, "https://api.bilibili.com"+endpoint, cookie, "https://space.bilibili.com/")
	if err != nil {
		return nil, err
	}
	code, valid := result["code"].(float64)
	if !valid || code != 0 {
		if code != -404 {
			alerts.Emit(alerts.Event{Kind: "api", Source: "Bilibili", Level: "warning", Title: "Bilibili API 返回错误", Message: fmt.Sprintf("业务错误码：%.0f", code), Code: int(code), Target: "https://api.bilibili.com"})
		}
		return nil, &APIError{Code: int(code)}
	}
	data, ok := result["data"].(map[string]any)
	if !ok {
		return nil, errors.New("Bilibili response data missing")
	}
	return data, nil
}
func clean(v any) string { return strings.TrimSpace(tagsHTML.ReplaceAllString(text(v), "")) }
func image(v any) string {
	value := text(v)
	if strings.HasPrefix(value, "//") {
		value = "https:" + value
	}
	value = strings.TrimPrefix(value, "http:")
	if strings.HasPrefix(value, "//") {
		value = "https:" + value
	}
	if !strings.HasPrefix(value, "https://") {
		return ""
	}
	return value
}
func ParseDuration(value string) int64 {
	total := int64(0)
	for _, part := range strings.Split(strings.TrimSpace(value), ":") {
		n, err := strconv.ParseInt(part, 10, 64)
		if err != nil || n < 0 {
			return 0
		}
		total = total*60 + n
	}
	return total
}
func numeric(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, !math.IsNaN(n) && !math.IsInf(n, 0)
	case string:
		r, err := strconv.ParseFloat(n, 64)
		return r, err == nil && !math.IsNaN(r) && !math.IsInf(r, 0)
	default:
		return 0, false
	}
}
func normalizedVideo(item map[string]any) (Video, bool) {
	id := text(item["bvid"])
	title := clean(item["title"])
	if !bvidPattern.MatchString(id) || title == "" {
		return Video{}, false
	}
	cover := image(item["pic"])
	if cover != "" && !strings.Contains(cover, "@") {
		cover += "@480w_270h_1c.webp"
	}
	description := text(item["desc"])
	if _, ok := item["desc"].(string); !ok {
		description = text(item["description"])
	}
	runes := []rune(strings.Join(strings.Fields(description), " "))
	if len(runes) > 500 {
		runes = runes[:500]
	}
	duration, ok := numeric(item["duration"])
	length := ParseDuration(text(item["length"]))
	if ok && duration >= 0 {
		length = int64(math.Round(duration))
	}
	published, ok := numeric(item["pubdate"])
	if !ok {
		published, ok = numeric(item["created"])
	}
	var date *string
	if ok && published > 0 {
		value := time.Unix(int64(published), 0).UTC().Format("2006-01-02T15:04:05.000Z")
		date = &value
	}
	stat := object(item["stat"])
	number := func(primary, secondary any) int64 {
		v, ok := numeric(primary)
		if !ok {
			v, _ = numeric(secondary)
		}
		if v < 0 {
			return 0
		}
		return int64(v)
	}
	return Video{BVID: id, Title: title, Cover: cover, Description: string(runes), Duration: length, PublishedAt: date, Play: number(stat["view"], item["play"]), Danmaku: number(stat["danmaku"], item["video_review"]), CommentCount: number(stat["reply"], item["comment"]), URL: "https://www.bilibili.com/video/" + id, FetchedAt: stamp()}, true
}
func parsePage(payload map[string]any) ([]Video, int, error) {
	code, ok := payload["code"].(float64)
	if !ok || code != 0 {
		return nil, 0, &APIError{Code: int(code)}
	}
	data := object(payload["data"])
	raw, ok := data["archives"].([]any)
	totalKey := "total"
	if !ok {
		legacy, exists := data["list"].(map[string]any)
		if !exists {
			return nil, 0, errors.New("Bilibili list shape invalid")
		}
		raw, _ = legacy["vlist"].([]any)
		totalKey = "count"
	}
	videos := []Video{}
	for _, value := range raw {
		if v, ok := normalizedVideo(object(value)); ok {
			videos = append(videos, v)
		}
	}
	n, ok := numeric(object(data["page"])[totalKey])
	total := len(videos)
	if ok {
		total = int(n)
	}
	return videos, total, nil
}

var mixin = []int{46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52}

func SignWBI(params map[string]string, img, sub string, seconds int64) (string, error) {
	source := img + sub
	if len(source) < 64 {
		return "", errors.New("invalid WBI keys")
	}
	key := make([]byte, 32)
	for i, index := range mixin[:32] {
		key[i] = source[index]
	}
	keys := []string{}
	values := map[string]string{}
	for k, v := range params {
		keys = append(keys, k)
		values[k] = v
	}
	if _, ok := params["wts"]; !ok {
		keys = append(keys, "wts")
	}
	values["wts"] = strconv.FormatInt(seconds, 10)
	sort.Strings(keys)
	pairs := []string{}
	for _, k := range keys {
		v := strings.Map(func(c rune) rune {
			if strings.ContainsRune("!'()*", c) {
				return -1
			}
			return c
		}, values[k])
		pairs = append(pairs, encode(k)+"="+encode(v))
	}
	query := strings.Join(pairs, "&")
	hash := md5.Sum([]byte(query + string(key)))
	return query + "&w_rid=" + hex.EncodeToString(hash[:]), nil
}
func encode(value string) string { return strings.ReplaceAll(url.QueryEscape(value), "+", "%20") }
func (c *Client) keys(ctx context.Context) (string, string, error) {
	result, err := c.request(ctx, "https://api.bilibili.com/x/web-interface/nav", "", "https://space.bilibili.com/")
	if err != nil {
		return "", "", err
	}
	images := object(object(result["data"])["wbi_img"])
	img, sub := text(images["img_url"]), text(images["sub_url"])
	if img == "" || sub == "" {
		return "", "", errors.New("WBI keys unavailable")
	}
	return strings.SplitN(path.Base(img), ".", 2)[0], strings.SplitN(path.Base(sub), ".", 2)[0], nil
}
