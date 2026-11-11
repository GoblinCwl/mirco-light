package video

import (
	"context"
	"errors"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (c *Client) Detail(ctx context.Context, bvid, owner, cookie string) (map[string]any, error) {
	if !bvidPattern.MatchString(bvid) {
		return nil, errors.New("invalid BV id")
	}
	data, err := c.data(ctx, "/x/web-interface/view?bvid="+url.QueryEscape(bvid), cookie)
	if err != nil {
		var upstream *APIError
		if errors.As(err, &upstream) && upstream.Code == -404 {
			return map[string]any{"bvid": bvid, "availability": "unavailable", "unavailableReason": "哔哩哔哩当前未提供该视频的公开内容，视频可能已删除或取消公开。", "description": "", "pages": []any{}, "stats": map[string]any{"play": nil, "danmaku": nil, "like": nil, "coin": nil, "favorite": nil, "share": nil}, "updatedAt": stamp()}, nil
		}
		return nil, err
	}
	actual, _ := numeric(object(data["owner"])["mid"])
	if text(data["bvid"]) != bvid || strconv.FormatInt(int64(actual), 10) != owner {
		return nil, errors.New("video does not belong to channel")
	}
	pages := []map[string]any{}
	for _, raw := range list(data["pages"]) {
		page := object(raw)
		cid, ok := numeric(page["cid"])
		n, valid := numeric(page["page"])
		if !ok || !valid || cid <= 0 || n <= 0 || cid != float64(int64(cid)) || n != float64(int64(n)) {
			continue
		}
		duration, _ := numeric(page["duration"])
		if duration < 0 {
			duration = 0
		}
		pages = append(pages, map[string]any{"cid": int64(cid), "page": int64(n), "title": clean(page["part"]), "duration": duration})
	}
	stats := map[string]any{}
	for key, source := range map[string]string{"play": "view", "danmaku": "danmaku", "like": "like", "coin": "coin", "favorite": "favorite", "share": "share"} {
		n, ok := numeric(object(data["stat"])[source])
		var value any
		if ok && n >= 0 {
			value = n
		}
		stats[key] = value
	}
	return map[string]any{"availability": "available", "bvid": bvid, "description": clean(data["desc"]), "pages": pages, "stats": stats, "updatedAt": stamp()}, nil
}
func (c *Client) Collections(ctx context.Context, cookie string) (map[string]any, error) {
	result := []map[string]any{}
	seen := map[string]bool{}
	complete := false
	for page := 1; page <= 100; page++ {
		data, err := c.data(ctx, "/x/polymer/web-space/seasons_series_list?mid="+url.QueryEscape(c.MID)+"&page_num="+strconv.Itoa(page)+"&page_size=20", cookie)
		if err != nil {
			return nil, err
		}
		lists := object(data["items_lists"])
		seasons, ok := lists["seasons_list"].([]any)
		series, valid := lists["series_list"].([]any)
		if !ok || !valid {
			return nil, errors.New("invalid series list")
		}
		pageCount := 0
		for _, raw := range append(append([]any{}, seasons...), series...) {
			meta := object(object(raw)["meta"])
			source := meta["series_id"]
			kind := "series"
			if source == nil {
				source = meta["season_id"]
				kind = "season"
			}
			id, _ := numeric(source)
			title := clean(meta["title"])
			if title == "" {
				title = clean(meta["name"])
			}
			title = strings.TrimPrefix(strings.TrimPrefix(title, "合集·"), "合集・")
			title = strings.TrimSpace(title)
			if id <= 0 || title == "" {
				continue
			}
			pageCount++
			key := kind + "-" + strconv.FormatInt(int64(id), 10)
			if kind != "series" || seen[key] {
				continue
			}
			seen[key] = true
			result = append(result, map[string]any{"id": key, "kind": kind, "sourceId": strconv.FormatInt(int64(id), 10), "title": title, "description": clean(meta["description"]), "cover": image(meta["cover"]), "bvids": []string{}, "total": count(meta["total"])})
		}
		total, _ := numeric(object(lists["page"])["total"])
		if pageCount == 0 || page*20 >= int(total) {
			complete = true
			break
		}
	}
	if !complete {
		return nil, errors.New("collection pagination incomplete")
	}
	for _, collection := range result {
		ids := []string{}
		seen := map[string]bool{}
		complete = false
		for page := 1; page <= 100; page++ {
			params := url.Values{"mid": []string{c.MID}, "series_id": []string{text(collection["sourceId"])}, "only_normal": []string{"true"}, "sort": []string{"asc"}, "pn": []string{strconv.Itoa(page)}, "ps": []string{"100"}}
			data, err := c.data(ctx, "/x/series/archives?"+params.Encode(), cookie)
			if err != nil {
				return nil, err
			}
			archives, ok := data["archives"].([]any)
			if !ok {
				return nil, errors.New("invalid series members")
			}
			for _, raw := range archives {
				id := text(object(raw)["bvid"])
				if bvidPattern.MatchString(id) && !seen[id] {
					seen[id] = true
					ids = append(ids, id)
				}
			}
			total, ok := numeric(object(data["page"])["total"])
			if !ok {
				total = count(collection["total"])
			}
			if len(archives) == 0 || page*100 >= int(total) {
				complete = true
				break
			}
		}
		if !complete {
			return nil, errors.New("series member pagination incomplete")
		}
		collection["bvids"] = ids
		if err := wait(ctx, 350*time.Millisecond); err != nil {
			return nil, err
		}
	}
	return map[string]any{"collections": result, "updatedAt": stamp()}, nil
}
func (c *Client) Profile(ctx context.Context, cookie string) (map[string]any, error) {
	data, err := c.data(ctx, "/x/web-interface/card?mid="+url.QueryEscape(c.MID), cookie)
	if err != nil {
		return nil, err
	}
	card := object(data["card"])
	mid, _ := numeric(card["mid"])
	if strconv.FormatInt(int64(mid), 10) != c.MID || clean(card["name"]) == "" {
		return nil, errors.New("invalid Bilibili profile")
	}
	integer := func(value any) any {
		if value == nil || value == "" {
			return nil
		}
		n, ok := numeric(value)
		if !ok || n < 0 || n != float64(int64(n)) {
			return nil
		}
		return int64(n)
	}
	followers := data["follower"]
	if followers == nil {
		followers = card["fans"]
	}
	return map[string]any{"mid": c.MID, "name": clean(card["name"]), "avatar": image(card["face"]), "description": clean(card["sign"]), "level": integer(object(card["level_info"])["current_level"]), "followers": integer(followers), "following": integer(card["attention"]), "videos": integer(data["archive_count"]), "likes": integer(data["like_num"]), "updatedAt": stamp()}, nil
}
func (c *Client) Activities(ctx context.Context, cookie string) ([]map[string]any, error) {
	data, err := c.data(ctx, "/x/polymer/web-dynamic/v1/feed/space?host_mid="+url.QueryEscape(c.MID)+"&web_location=333.999", cookie)
	if err != nil {
		return nil, err
	}
	source, ok := data["items"].([]any)
	if !ok {
		return nil, errors.New("invalid Bilibili activity list")
	}
	labels := map[string]string{"DYNAMIC_TYPE_AV": "发布视频", "DYNAMIC_TYPE_WORD": "发布动态", "DYNAMIC_TYPE_DRAW": "发布图文", "DYNAMIC_TYPE_ARTICLE": "发布文章", "DYNAMIC_TYPE_FORWARD": "转发动态"}
	rows := []map[string]any{}
	for _, raw := range source {
		item := object(raw)
		label := labels[text(item["type"])]
		id := text(item["id_str"])
		_, err := strconv.ParseUint(id, 10, 64)
		timestamp, ok := numeric(object(object(item["modules"])["module_author"])["pub_ts"])
		if label == "" || err != nil || !ok || timestamp <= 0 {
			continue
		}
		dynamic := object(object(item["modules"])["module_dynamic"])
		archive := object(object(dynamic["major"])["archive"])
		bvid := text(archive["bvid"])
		if !bvidPattern.MatchString(bvid) {
			bvid = ""
		}
		body := clean(archive["title"])
		if body == "" {
			body = clean(object(object(dynamic["major"])["article"])["title"])
		}
		if body == "" {
			body = clean(object(dynamic["desc"])["text"])
		}
		if body == "" {
			body = label
		}
		runes := []rune(body)
		if len(runes) > 240 {
			runes = runes[:240]
		}
		rows = append(rows, map[string]any{"id": id, "label": label, "bvid": bvid, "date": time.Unix(int64(timestamp), 0).UTC().Format("2006-01-02T15:04:05.000Z"), "text": string(runes)})
	}
	sort.SliceStable(rows, func(i, j int) bool { return text(rows[i]["date"]) > text(rows[j]["date"]) })
	if len(rows) > 20 {
		rows = rows[:20]
	}
	return rows, nil
}
func wait(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
