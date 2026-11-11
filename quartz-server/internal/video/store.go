package video

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/content"
	"strconv"
	"strings"
	"time"
)

type Video struct {
	BVID         string  `json:"bvid"`
	Title        string  `json:"title"`
	Cover        string  `json:"cover"`
	Description  string  `json:"description"`
	Duration     int64   `json:"duration"`
	PublishedAt  *string `json:"publishedAt"`
	Play         int64   `json:"play"`
	Danmaku      int64   `json:"danmaku"`
	CommentCount int64   `json:"commentCount"`
	URL          string  `json:"url"`
	FetchedAt    string  `json:"fetchedAt"`
}
type Store struct {
	DB  *sql.DB
	MID string
}

func stamp() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }
func (s Store) All(ctx context.Context) ([]Video, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT bvid,title,cover,description,duration,published_at,play,danmaku,comment_count,fetched_at FROM videos ORDER BY published_at DESC,bvid DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	videos := []Video{}
	for rows.Next() {
		var v Video
		if err = rows.Scan(&v.BVID, &v.Title, &v.Cover, &v.Description, &v.Duration, &v.PublishedAt, &v.Play, &v.Danmaku, &v.CommentCount, &v.FetchedAt); err != nil {
			return nil, err
		}
		v.URL = "https://www.bilibili.com/video/" + v.BVID
		videos = append(videos, v)
	}
	return videos, rows.Err()
}
func (s Store) Meta(ctx context.Context) (map[string]string, error) {
	rows, err := s.DB.QueryContext(ctx, "SELECT `key`,value FROM video_meta")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := map[string]string{}
	for rows.Next() {
		var key, value string
		if err = rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		values[key] = value
	}
	return values, rows.Err()
}
func (s Store) Put(ctx context.Context, key string, value any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return s.PutText(ctx, key, string(raw))
}
func (s Store) PutText(ctx context.Context, key, value string) error {
	_, err := s.DB.ExecContext(ctx, "INSERT INTO video_meta(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", key, value)
	return err
}
func (s Store) Detail(ctx context.Context, bvid string) (map[string]any, error) {
	var raw string
	err := s.DB.QueryRowContext(ctx, "SELECT value FROM video_meta WHERE `key`=?", "detail:"+bvid).Scan(&raw)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if json.Unmarshal([]byte(raw), &result) != nil {
		return nil, errors.New("视频缓存格式无效")
	}
	return result, nil
}
func (s Store) Merge(ctx context.Context, videos []Video, at string, complete bool) (int, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	keys := []any{}
	for _, v := range videos {
		fetched := v.FetchedAt
		if fetched == "" {
			fetched = at
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO videos(bvid,title,cover,description,duration,published_at,play,danmaku,comment_count,fetched_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),cover=VALUES(cover),description=VALUES(description),duration=VALUES(duration),published_at=VALUES(published_at),play=VALUES(play),danmaku=VALUES(danmaku),comment_count=VALUES(comment_count),fetched_at=VALUES(fetched_at)", v.BVID, v.Title, v.Cover, v.Description, v.Duration, v.PublishedAt, v.Play, v.Danmaku, v.CommentCount, fetched); err != nil {
			return 0, err
		}
		keys = append(keys, v.BVID)
	}
	if complete {
		query := "DELETE FROM videos"
		if len(keys) > 0 {
			query += " WHERE bvid NOT IN (" + strings.TrimSuffix(strings.Repeat("?,", len(keys)), ",") + ")"
		}
		if _, err = tx.ExecContext(ctx, query, keys...); err != nil {
			return 0, err
		}
	}
	var count int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM videos").Scan(&count); err != nil {
		return 0, err
	}
	meta := map[string]string{"last_attempt": at, "total": strconv.Itoa(count)}
	if complete {
		meta["last_success"] = at
		meta["last_error"] = ""
	} else {
		meta["last_error"] = "partial sync"
	}
	for key, value := range meta {
		if _, err = tx.ExecContext(ctx, "INSERT INTO video_meta(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", key, value); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(); err != nil {
		return 0, err
	}
	return count, nil
}
func parse(raw string, fallback any) any {
	if raw == "" {
		return fallback
	}
	var value any
	if json.Unmarshal([]byte(raw), &value) != nil {
		return fallback
	}
	return value
}
func object(v any) map[string]any {
	m, _ := v.(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}
func list(v any) []any    { a, _ := v.([]any); return a }
func text(v any) string   { s, _ := v.(string); return s }
func count(v any) float64 { n, _ := v.(float64); return n }
func (s Store) Library(ctx context.Context, full bool) (map[string]any, error) {
	videos, err := s.All(ctx)
	if err != nil {
		return nil, err
	}
	meta, err := s.Meta(ctx)
	if err != nil {
		return nil, err
	}
	known := map[string]bool{}
	for _, v := range videos {
		known[v.BVID] = true
	}
	tests := []any{}
	if full {
		for _, test := range list(parse(meta["test_videos"], []any{})) {
			v := object(test)
			if !known[text(v["bvid"])] {
				tests = append(tests, v)
			}
		}
	}
	total, _ := strconv.Atoi(meta["total"])
	optional := func(value string) any {
		if value == "" {
			return nil
		}
		return value
	}
	result := map[string]any{"mid": s.MID, "channel": "https://space.bilibili.com/" + s.MID + "/video", "total": total + len(tests), "updatedAt": optional(meta["last_success"]), "attemptedAt": optional(meta["last_attempt"]), "error": optional(meta["last_error"])}
	rows := []map[string]any{}
	plays := float64(0)
	appendVideo := func(v map[string]any) {
		if full {
			detail := object(parse(meta["detail:"+text(v["bvid"])], nil))
			availability := text(detail["availability"])
			if availability == "" {
				availability = text(v["availability"])
			}
			if availability == "" {
				availability = "available"
			}
			v["availability"] = availability
			if reason := text(detail["unavailableReason"]); reason != "" {
				v["unavailableReason"] = reason
			}
			if detail["pages"] != nil {
				v["parts"] = detail["pages"]
			}
		}
		rows = append(rows, v)
	}
	for _, v := range videos {
		raw, _ := json.Marshal(v)
		row := map[string]any{}
		json.Unmarshal(raw, &row)
		appendVideo(row)
		detail := object(parse(meta["detail:"+v.BVID], nil))
		stats := object(detail["stats"])
		if n, ok := stats["play"].(float64); ok {
			plays += n
		} else {
			plays += float64(v.Play)
		}
	}
	for _, raw := range tests {
		source := object(raw)
		copy := map[string]any{"test": true}
		for key, value := range source {
			if key != "ownerMid" {
				copy[key] = value
			}
		}
		appendVideo(copy)
	}
	result["videos"] = rows
	if full {
		library := object(parse(meta["library"], map[string]any{"collections": []any{}, "updatedAt": nil}))
		result["collections"] = library["collections"]
		result["collectionsUpdatedAt"] = library["updatedAt"]
		profile := parse(meta["profile"], nil)
		if source, ok := profile.(map[string]any); ok {
			copy := map[string]any{}
			for k, v := range source {
				copy[k] = v
			}
			var hash string
			err = s.DB.QueryRowContext(ctx, "SELECT hash FROM video_assets WHERE name='avatar'").Scan(&hash)
			if err != nil && err != sql.ErrNoRows {
				return nil, err
			}
			copy["avatar"] = "/static/Profile_compressed.png"
			if hash != "" {
				copy["avatar"] = "/api/video/avatar?v=" + hash
			}
			copy["plays"] = plays
			profile = copy
		}
		result["profile"] = profile
		result["activities"] = parse(meta["activities"], nil)
	}
	return result, nil
}
func (s Store) Content(ctx context.Context) ([]content.Item, error) {
	library, err := s.Library(ctx, true)
	if err != nil {
		return nil, err
	}
	if library["error"] != nil || library["updatedAt"] == nil || library["collections"] == nil {
		return nil, errors.New("视频同步尚未完整完成")
	}
	tags := map[string][]string{}
	seriesByVideo := map[string][]map[string]string{}
	for _, raw := range list(library["collections"]) {
		series := object(raw)
		if series["kind"] != "series" || series["id"] == "other" {
			continue
		}
		for _, id := range list(series["bvids"]) {
			bvid := text(id)
			seriesByVideo[bvid] = append(seriesByVideo[bvid], map[string]string{"id": text(series["id"]), "title": text(series["title"])})
			tag := text(series["title"])
			exists := false
			for _, old := range tags[bvid] {
				if old == tag {
					exists = true
				}
			}
			if !exists {
				tags[bvid] = append(tags[bvid], tag)
			}
		}
	}
	items := []content.Item{}
	for _, v := range library["videos"].([]map[string]any) {
		if v["availability"] == "unavailable" {
			continue
		}
		bvid := text(v["bvid"])
		items = append(items, content.Item{SourceID: bvid, Slug: "Video/" + bvid, Title: text(v["title"]), Description: text(v["description"]), Content: text(v["description"]), Tags: tags[bvid], PublishedAt: text(v["publishedAt"]), Extra: map[string]any{"bvid": bvid, "cover": v["cover"], "duration": v["duration"], "play": v["play"], "series": seriesByVideo[bvid]}})
	}
	return items, nil
}
