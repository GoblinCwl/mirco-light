package jellyfin

import (
	"context"
	"database/sql"
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
	"sync"
	"time"
	"unicode/utf8"
)

var videoExtension = regexp.MustCompile(`(?i)\.(?:mkv|mp4|m4v|avi|mov|wmv|flv|webm|ts|m2ts|mts|mpg|mpeg|3gp|ogv)$`)
var releaseYear = regexp.MustCompile(`\s*[（(](?:19|20)\d{2}[）)]\s*$`)

func DanmakuFileName(filename string, item map[string]any) string {
	index, indexExists := item["IndexNumber"]
	episode := number(index)
	if text(item["SeriesName"]) != "" && indexExists && index != nil && finite(episode) && math.Trunc(episode) == episode {
		season := float64(1)
		if value, exists := item["ParentIndexNumber"]; exists && value != nil && math.Trunc(number(value)) == number(value) {
			season = number(value)
		}
		seriesName, seasonName := strings.TrimSpace(text(item["SeriesName"])), strings.TrimSpace(text(item["SeasonName"]))
		title := seriesName
		if seasonName != "" {
			if strings.Contains(seasonName, seriesName) {
				title = seasonName
			} else {
				title = seriesName + " " + seasonName
			}
		}
		return fmt.Sprintf("%s S%02.0fE%02.0f", title, season, episode)
	}
	return strings.TrimSpace(releaseYear.ReplaceAllString(videoExtension.ReplaceAllString(path.Base(filename), ""), ""))
}
func NormalizeDanmaku(raw any) []map[string]any {
	comments := list(raw)
	if len(comments) > 100000 {
		comments = comments[:100000]
	}
	out := []map[string]any{}
	for _, raw := range comments {
		comment := object(raw)
		p, ok := comment["p"].(string)
		message, valid := comment["m"].(string)
		if !ok || !valid || strings.TrimSpace(message) == "" {
			continue
		}
		parts := strings.Split(p, ",")
		if len(parts) < 2 {
			continue
		}
		at, err := strconv.ParseFloat(parts[0], 64)
		if err != nil || !finite(at) || at < 0 {
			continue
		}
		mode, err := strconv.ParseFloat(parts[1], 64)
		if err != nil || mode < 1 || mode > 6 || math.Trunc(mode) != mode {
			continue
		}
		color := float64(0xffffff)
		if len(parts) > 2 {
			if n, err := strconv.ParseFloat(parts[2], 64); err == nil && finite(n) {
				color = math.Max(0, math.Min(0xffffff, n))
			}
		}
		displayMode := 0
		if mode == 4 {
			displayMode = 2
		} else if mode == 5 {
			displayMode = 1
		}
		if runes := []rune(message); len(runes) > 1000 {
			message = string(runes[:1000])
		}
		out = append(out, map[string]any{"text": message, "time": at, "mode": displayMode, "color": fmt.Sprintf("#%06x", int64(color))})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i]["time"].(float64) < out[j]["time"].(float64) })
	return out
}

type danmakuCached struct {
	value          map[string]any
	until, created time.Time
}
type danmakuPending struct {
	done  chan struct{}
	value map[string]any
	err   error
}
type Danmaku struct {
	Backend    *Backend
	mu         sync.Mutex
	entries    map[string]danmakuCached
	pending    map[string]*danmakuPending
	generation uint64
}

func (d *Danmaku) Invalidate() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.entries = map[string]danmakuCached{}
	d.pending = map[string]*danmakuPending{}
	d.generation++
}
func (d *Danmaku) cached(ctx context.Context, key string, ttl time.Duration, load func(context.Context) (map[string]any, error)) (value map[string]any, err error) {
	d.mu.Lock()
	if d.entries == nil {
		d.entries = map[string]danmakuCached{}
	}
	if d.pending == nil {
		d.pending = map[string]*danmakuPending{}
	}
	generation := d.generation
	if entry, ok := d.entries[key]; ok && time.Now().Before(entry.until) {
		d.mu.Unlock()
		return entry.value, nil
	}
	if work := d.pending[key]; work != nil {
		d.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-work.done:
			return work.value, work.err
		}
	}
	work := &danmakuPending{done: make(chan struct{})}
	d.pending[key] = work
	d.mu.Unlock()
	defer func() {
		if recover() != nil {
			value = nil
			err = errors.New("弹幕服务响应无效")
		}
		d.mu.Lock()
		defer d.mu.Unlock()
		if generation == d.generation && err == nil {
			lifetime := ttl
			if value == nil {
				lifetime = 2 * time.Minute
			}
			if len(d.entries) >= 200 {
				oldest := ""
				var before time.Time
				for k, entry := range d.entries {
					if before.IsZero() || entry.created.Before(before) {
						oldest, before = k, entry.created
					}
				}
				delete(d.entries, oldest)
			}
			now := time.Now()
			d.entries[key] = danmakuCached{value: value, until: now.Add(lifetime), created: now}
		}
		work.value, work.err = value, err
		if d.pending[key] == work {
			delete(d.pending, key)
		}
		close(work.done)
	}()
	return load(ctx)
}
func (d *Danmaku) request(ctx context.Context, endpoint string, body any) (map[string]any, error) {
	values, err := d.Backend.Settings(ctx)
	if err != nil {
		return nil, err
	}
	token := text(values["api.danmu.token"])
	if token == "" {
		return nil, errors.New("弹幕服务未配置")
	}
	base := text(values["api.danmu.url"])
	if base == "" {
		base = "http://danmu-api:9321"
	}
	method := "GET"
	var input io.Reader
	if body != nil {
		method = "POST"
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		input = strings.NewReader(string(raw))
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(base, "/")+"/"+url.PathEscape(token)+endpoint, input)
	if err != nil {
		return nil, err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	client := d.Backend.HTTP
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	response, err := alerts.Do(client, "弹幕 API", request)
	if err != nil {
		return nil, errors.New("弹幕服务暂不可用")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, errors.New("弹幕服务暂不可用")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 64<<20+1))
	if err != nil || len(raw) > 64<<20 {
		return nil, errors.New("弹幕服务响应过大或无效")
	}
	var value map[string]any
	if json.Unmarshal(raw, &value) != nil || value == nil {
		return nil, errors.New("弹幕服务响应无效")
	}
	return value, nil
}
func upstreamFailed(value map[string]any) bool {
	code := value["errorCode"]
	return value["success"] == false || code != nil && code != float64(0) && code != "" && code != false
}
func stringValue(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case float64:
		return numeric(v)
	case int:
		return strconv.Itoa(v)
	}
	return ""
}
func truncated(value string, max int) string {
	r := []rune(value)
	if len(r) > max {
		r = r[:max]
	}
	return string(r)
}

var episodeID = regexp.MustCompile(`^\d+$`)
var danmuSource = regexp.MustCompile(`(?i)\bfrom\s+(.+)$`)
var bracketSource = regexp.MustCompile(`^\[([^\]]+)\]`)

func (d *Danmaku) Auto(ctx context.Context, keyword string) (map[string]any, error) {
	return d.cached(ctx, "auto:"+keyword, 15*time.Minute, func(ctx context.Context) (map[string]any, error) {
		match, err := d.request(ctx, "/api/v2/match", map[string]any{"fileName": keyword})
		if err != nil {
			return nil, err
		}
		matches := list(match["matches"])
		var entry map[string]any
		if len(matches) > 0 {
			entry = object(matches[0])
		}
		id := stringValue(entry["episodeId"])
		if match["isMatched"] != true || !episodeID.MatchString(id) {
			if upstreamFailed(match) {
				return nil, errors.New("弹幕匹配失败")
			}
			return nil, nil
		}
		value, err := d.request(ctx, "/api/v2/comment/"+id+"?format=json", nil)
		if err != nil {
			return nil, err
		}
		if upstreamFailed(value) {
			return nil, errors.New("弹幕读取失败")
		}
		comments := NormalizeDanmaku(value["comments"])
		if len(comments) == 0 {
			return nil, nil
		}
		title := text(entry["animeTitle"])
		episodeTitle := truncated(text(entry["episodeTitle"]), 500)
		source := text(entry["sourceName"])
		if source == "" {
			if match := danmuSource.FindStringSubmatch(title); len(match) > 1 {
				source = match[1]
			}
		}
		if source == "" {
			if match := bracketSource.FindStringSubmatch(episodeTitle); len(match) > 1 {
				source = match[1]
			}
		}
		if source == "" {
			source = "danmu-api"
		}
		titles := []string{}
		if title != "" {
			titles = append(titles, truncated(title, 500))
		}
		if episodeTitle != "" {
			titles = append(titles, episodeTitle)
		}
		return map[string]any{"comments": comments, "source": truncated(source, 80), "title": strings.Join(titles, " / ")}, nil
	})
}
func (d *Danmaku) read(ctx context.Context, endpoint string, ttl time.Duration) (map[string]any, error) {
	return d.cached(ctx, "browse:"+endpoint, ttl, func(ctx context.Context) (map[string]any, error) {
		value, err := d.request(ctx, endpoint, nil)
		if err != nil {
			return nil, err
		}
		if upstreamFailed(value) {
			return nil, errors.New("弹幕服务暂不可用")
		}
		return value, nil
	})
}

var animeID = regexp.MustCompile(`^[a-zA-Z0-9_.:-]{1,120}$`)
var shortEpisodeID = regexp.MustCompile(`^\d{1,30}$`)

func (d *Danmaku) Browse(ctx context.Context, action string, input map[string]any) (map[string]any, error) {
	switch action {
	case "search":
		query, ok := input["query"].(string)
		if !ok || strings.TrimSpace(query) == "" || utf8.RuneCountInString(query) > 150 || strings.IndexFunc(query, func(r rune) bool { return r < 32 }) >= 0 {
			return nil, errors.New("请输入节目名，最多 150 字")
		}
		value, err := d.read(ctx, "/api/v2/search/anime?keyword="+url.QueryEscape(strings.TrimSpace(query)), time.Minute)
		if err != nil {
			return nil, err
		}
		animes := []map[string]any{}
		for _, raw := range list(value["animes"]) {
			item := object(raw)
			if item["animeId"] == nil {
				continue
			}
			kind := text(item["typeDescription"])
			if kind == "" {
				kind = text(item["type"])
			}
			animes = append(animes, map[string]any{"id": stringValue(item["animeId"]), "title": text(item["animeTitle"]), "type": kind, "count": number(item["episodeCount"])})
		}
		return map[string]any{"animes": animes}, nil
	case "episodes":
		id, ok := input["id"].(string)
		if !ok || !animeID.MatchString(id) {
			return nil, errors.New("节目选择无效")
		}
		value, err := d.read(ctx, "/api/v2/bangumi/"+url.PathEscape(id), 5*time.Minute)
		if err != nil {
			return nil, err
		}
		bangumi := object(value["bangumi"])
		episodes := []map[string]any{}
		for _, raw := range list(bangumi["episodes"]) {
			item := object(raw)
			id := stringValue(item["episodeId"])
			if !episodeID.MatchString(id) {
				continue
			}
			episodes = append(episodes, map[string]any{"id": id, "title": text(item["episodeTitle"]), "number": stringValue(item["episodeNumber"])})
		}
		return map[string]any{"title": text(bangumi["animeTitle"]), "episodes": episodes}, nil
	case "select":
		id, ok := input["id"].(string)
		if !ok || !shortEpisodeID.MatchString(id) {
			return nil, errors.New("集数选择无效")
		}
		value, err := d.read(ctx, "/api/v2/comment/"+id+"?format=json", 15*time.Minute)
		if err != nil {
			return nil, err
		}
		return map[string]any{"comments": NormalizeDanmaku(value["comments"])}, nil
	}
	return nil, errors.New("弹幕操作无效")
}
func (s *Service) DanmakuRequest(ctx context.Context, body map[string]any, token string) (map[string]any, error) {
	virtual, err := NormalPath(text(body["path"]))
	if err != nil {
		return nil, err
	}
	access := Access{Path: virtual, Password: text(body["password"]), Token: token}
	physical, err := s.Backend.Authorize(ctx, access, false)
	if err != nil {
		return nil, err
	}
	action := text(body["action"])
	if action != "" && action != "auto" {
		return s.Danmaku.Browse(ctx, action, body)
	}
	var item map[string]any
	if physical != "" {
		var kind string
		var series, seasonName sql.NullString
		var index, parent sql.NullInt64
		err = s.Backend.Library.QueryRowContext(ctx, "SELECT e.Type,e.SeriesName,e.IndexNumber,e.ParentIndexNumber,s.Name AS SeasonName FROM BaseItems e LEFT JOIN BaseItems s ON s.Id=e.SeasonId WHERE e.Path=? LIMIT 1", physical).Scan(&kind, &series, &index, &parent, &seasonName)
		if err != nil && err != sql.ErrNoRows {
			return nil, err
		}
		item = map[string]any{"Type": kind, "SeriesName": series.String, "SeasonName": seasonName.String}
		if index.Valid {
			item["IndexNumber"] = float64(index.Int64)
		}
		if parent.Valid {
			item["ParentIndexNumber"] = float64(parent.Int64)
		}
	}
	name := access.Path
	if fileName, ok := body["fileName"].(string); ok && utf8.RuneCountInString(fileName) <= 1000 && !strings.ContainsAny(fileName, "/\\") && strings.IndexFunc(fileName, func(r rune) bool { return r < 32 }) < 0 {
		name = fileName
	}
	if physical != "" {
		name = physical
	}
	keyword := DanmakuFileName(name, item)
	if body["unrestrictedMatch"] != true {
		keyword += " @bilibili"
	}
	value, err := s.Danmaku.Auto(ctx, keyword)
	out := map[string]any{"comments": nil, "keyword": keyword}
	if err != nil {
		out["matchError"] = "自动匹配失败"
		return out, nil
	}
	for k, v := range value {
		out[k] = v
	}
	return out, nil
}
