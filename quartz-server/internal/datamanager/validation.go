package datamanager

import (
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/content"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func validate(id string, row map[string]any) error {
	text := func(key string) string { v, _ := row[key].(string); return v }
	if id == "friends" {
		if value := row["number"]; value != nil {
			n, err := strconv.ParseUint(fmt.Sprint(value), 10, 32)
			if err != nil || n == 0 {
				return errors.New("友链编号须为大于零的整数")
			}
		}
		example := fmt.Sprint(row["example"]) != "0" && row["example"] != nil
		f, err := community.ValidateFriend(community.Friend{ID: text("id"), Name: text("name"), URL: text("url"), BacklinkURL: text("backlink_url"), RSSURL: text("rss_url"), Avatar: text("avatar"), AvatarSource: text("avatar_source"), Description: text("description"), Status: text("status"), Example: example})
		if err != nil {
			return err
		}
		if !regexp.MustCompile(`^[a-zA-Z0-9_-]{1,80}$`).MatchString(f.ID) {
			return errors.New("友链标识无效")
		}
		row["name"] = f.Name
		row["url"] = f.URL
		row["backlink_url"] = f.BacklinkURL
		row["rss_url"] = f.RSSURL
		row["avatar"] = f.Avatar
		row["avatar_source"] = f.AvatarSource
		row["description"] = f.Description
		row["status"] = f.Status
	}
	if id == "feedback" {
		email := text("email")
		address, err := mail.ParseAddress(email)
		if err != nil || address.Address != email || len(email) > 254 || strings.TrimSpace(text("description")) == "" || utf8.RuneCountInString(text("description")) > 2000 {
			return errors.New("请填写有效邮箱与问题描述")
		}
		if text("status") != "待处理" && text("status") != "已解决" {
			return errors.New("反馈状态无效")
		}
	}
	if id == "videos" {
		if strings.TrimSpace(text("title")) == "" || !regexp.MustCompile(`^BV[A-Za-z0-9]{10}$`).MatchString(text("bvid")) {
			return errors.New("请填写有效的 BV 号与标题")
		}
	}
	for _, key := range []string{"play", "danmaku", "duration", "comment_count"} {
		if value, ok := row[key]; ok && value != nil {
			var number float64
			switch n := value.(type) {
			case int:
				number = float64(n)
			case int64:
				number = float64(n)
			case float64:
				number = n
			}
			if number < 0 {
				return errors.New("统计数值不能为负数")
			}
		}
	}
	for _, key := range []string{"first_seen", "last_seen", "created_at", "published_at", "fetched_at", "completed_at", "updated_at"} {
		if row[key] != nil {
			if _, err := time.Parse(time.RFC3339Nano, text(key)); err != nil {
				return errors.New("请输入有效时间")
			}
		}
	}
	if text("first_seen") != "" && text("last_seen") != "" {
		a, _ := time.Parse(time.RFC3339Nano, text("first_seen"))
		b, _ := time.Parse(time.RFC3339Nano, text("last_seen"))
		if a.After(b) {
			return errors.New("最近来访不能早于首次来访")
		}
	}
	if id == "daily-visitors" {
		if _, err := time.Parse("2006-01-02", text("day")); err != nil {
			return errors.New("日期无效")
		}
	}
	if text("mime") != "" && !regexp.MustCompile(`^image/(png|jpeg|gif|webp|avif)$`).MatchString(text("mime")) {
		return errors.New("仅支持常见图片类型")
	}
	if id == "content-index" {
		return content.NormalizeManagedRow(row)
	}
	if id == "journal" {
		if text("kind") != "content" && text("kind") != "site" && text("kind") != "service" {
			return errors.New("纪事类型无效")
		}
		var payload map[string]any
		if json.Unmarshal([]byte(text("payload")), &payload) != nil || payload == nil {
			return errors.New("纪事内容需要是 JSON 对象")
		}
	}
	if id == "repo-snapshots" || id == "video-meta" && regexp.MustCompile(`^(library|activities|profile|social_status|test_videos|detail:)`).MatchString(text("key")) {
		var value any
		if json.Unmarshal([]byte(text("value")), &value) != nil {
			return errors.New("内容需要是有效 JSON")
		}
		switch text("key") {
		case "activities", "test_videos":
			items, ok := value.([]any)
			if !ok {
				return errors.New("列表缓存需要是对象数组")
			}
			for _, item := range items {
				if _, ok = item.(map[string]any); !ok {
					return errors.New("列表缓存需要是对象数组")
				}
			}
		case "profile":
			if value != nil {
				if _, ok := value.(map[string]any); !ok {
					return errors.New("用户缓存需要是 JSON 对象")
				}
			}
		case "library":
			object, ok := value.(map[string]any)
			if !ok {
				return errors.New("视频系列缓存需要是对象")
			}
			if _, ok = object["collections"].([]any); !ok {
				return errors.New("视频系列缓存需要 collections")
			}
		}
		if strings.HasPrefix(text("key"), "detail:") {
			object, ok := value.(map[string]any)
			if !ok {
				return errors.New("视频详情需要是对象")
			}
			if _, ok = object["pages"].([]any); !ok {
				return errors.New("视频详情需要 pages 数组")
			}
		}
	}

	if id == "adapter-snapshots" {
		var value map[string]any
		if json.Unmarshal([]byte(text("value")), &value) != nil || value == nil {
			return errors.New("适配快照需要是 JSON 对象")
		}
	}
	if id == "repo-snapshots" && strings.HasPrefix(text("key"), "contributions:") {
		var value struct {
			Rows []json.RawMessage `json:"rows"`
		}
		if json.Unmarshal([]byte(text("value")), &value) != nil || value.Rows == nil {
			return errors.New("贡献缓存需要包含 rows 数组")
		}
	}
	if id == "video-meta" && text("key") == "library" {
		var value struct {
			Collections []map[string]json.RawMessage `json:"collections"`
		}
		if json.Unmarshal([]byte(text("value")), &value) != nil || value.Collections == nil {
			return errors.New("系列缓存格式无效")
		}
		for _, series := range value.Collections {
			var ids []json.RawMessage
			if json.Unmarshal(series["bvids"], &ids) != nil || ids == nil {
				return errors.New("系列缓存需要 bvids 数组")
			}
		}
	}
	if id == "video-meta" && text("key") == "activities" {
		var rows []map[string]any
		json.Unmarshal([]byte(text("value")), &rows)
		for _, row := range rows {
			for _, key := range []string{"url", "href"} {
				if value, ok := row[key].(string); ok && value != "" && !regexp.MustCompile(`^https?://|^/(?:[^/]|$)`).MatchString(value) {
					return errors.New("活动链接需要使用 HTTP、HTTPS 或本站路径")
				}
			}
		}
	}
	return nil
}
