package settings

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/taskconfig"
	"math"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

//go:embed schema.json
var schemaJSON []byte

type Field struct {
	Key            string `json:"key"`
	Type           string `json:"type"`
	Default        any    `json:"default"`
	Public         *bool  `json:"public"`
	Min, Max, Step float64
	Options        [][]string `json:"options"`
}
type Store struct{ DB *sql.DB }

func Schema() []map[string]any {
	var out []map[string]any
	json.Unmarshal(schemaJSON, &out)
	return append(out, taskconfig.Schema()...)
}
func fields() []Field {
	var out []Field
	raw, _ := json.Marshal(Schema())
	json.Unmarshal(raw, &out)
	return out
}
func (s Store) Read(ctx context.Context, public bool) (map[string]any, error) {
	values := map[string]any{}
	visible := map[string]bool{}
	for _, field := range fields() {
		visible[field.Key] = !public || field.Public == nil || *field.Public
		if visible[field.Key] {
			values[field.Key] = field.Default
		}
	}
	// Legacy video intervals remain effective until an explicit task value is saved.
	if !public {
		var legacy string
		err := s.DB.QueryRowContext(ctx, "SELECT value FROM video_meta WHERE `key`='sync_interval_ms'").Scan(&legacy)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if ms, err := strconv.ParseInt(legacy, 10, 64); err == nil && ms >= 1800000 && ms <= 604800000 {
			values[taskconfig.Key("video-sync")] = float64(ms / 1000)
		}
	}
	rows, err := s.DB.QueryContext(ctx, "SELECT `key`,value FROM settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, raw string
		if err = rows.Scan(&key, &raw); err != nil {
			return nil, err
		}
		if visible[key] {
			var value any
			if err = json.Unmarshal([]byte(raw), &value); err != nil {
				return nil, err
			}
			values[key] = value
		}
	}
	return values, rows.Err()
}
func address(value string) bool {
	if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") {
		u, err := url.Parse(value)
		return err == nil && u.Hostname() != ""
	}
	return strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") && !strings.ContainsAny(value, "\\\x00\r\n\t ")
}
func validate(key string, value any) (any, error) {
	var field *Field
	for _, f := range fields() {
		if f.Key == key {
			copy := f
			field = &copy
			break
		}
	}
	if field == nil {
		return nil, errors.New("配置项不存在")
	}
	if key == "friends.items" {
		return nil, errors.New("友链不属于站点配置，请通过数据管理逐条操作")
	}

	switch field.Type {
	case "boolean":
		if _, ok := value.(bool); !ok {
			return nil, errors.New("请选择开关状态")
		}
	case "number":
		v, ok := value.(float64)
		if !ok || math.IsNaN(v) || math.IsInf(v, 0) || v < field.Min || v > field.Max || field.Step >= 1 && math.Trunc(v) != v {
			return nil, errors.New("数值不符合配置范围")
		}
	default:
		v, ok := value.(string)
		max := int(field.Max)
		if max == 0 {
			max = 1000
		}
		if !ok || utf8.RuneCountInString(v) > max {
			return nil, errors.New("文本长度不符合要求")
		}
		switch field.Type {
		case "date":
			if v != "" {
				date, err := time.Parse("2006-01-02", v)
				today := time.Now().In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
				if err != nil || len(v) != 10 || date.Format("2006-01-02") > today {
					return nil, errors.New("请输入有效建站日期，不能晚于今天")
				}
			}
		case "time":
			if _, err := time.Parse("15:04", v); err != nil || len(v) != 5 {
				return nil, errors.New("请输入有效时间（HH:mm）")
			}
		case "select":
			valid := false
			for _, option := range field.Options {
				if len(option) > 0 && option[0] == v {
					valid = true
				}
			}
			if !valid {
				return nil, errors.New("请选择有效选项")
			}
		case "url":
			if !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
				return nil, errors.New("链接需要以 http:// 或 https:// 开头")
			}
		case "asset", "endpoint":
			if !address(v) {
				return nil, errors.New("请输入有效地址或本站路径")
			}
		case "article-route":
			v = strings.TrimSpace(v)
			if v != "" {
				u, err := url.Parse(v)
				if err != nil || !strings.HasPrefix(v, "/") || strings.HasPrefix(v, "//") || u.IsAbs() || u.Host != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.ContainsAny(v, "?#") || u.Path == "/" || strings.ContainsAny(u.Path, "\\\x00\r\n\t") || strings.Contains(u.Path, "//") || segment(u.Path, "..") || segment(u.Path, ".") {
					return nil, errors.New("请输入本站文章路径，不包含域名、查询参数或锚点")
				}
			}
			value = v
		case "path":
			if !strings.HasPrefix(v, "/") || strings.ContainsAny(v, "\x00\\") || segment(v, "..") {
				return nil, errors.New("请输入有效的绝对目录")
			}
		case "navigation":
			var links []struct {
				Label string   `json:"label"`
				Href  string   `json:"href"`
				Icon  string   `json:"icon"`
				Order *float64 `json:"order"`
			}
			if err := json.Unmarshal([]byte(v), &links); err != nil || links == nil || len(links) > 60 {
				return nil, errors.New("寻径链接最多60项")
			}
			for _, link := range links {
				if strings.TrimSpace(link.Label) == "" || utf8.RuneCountInString(link.Label) > 80 || !address(link.Href) || link.Order == nil {
					return nil, errors.New("请填写链接名称、有效地址与排序")
				}
				if !validNavigationIcon(link.Icon) {
					return nil, errors.New("请填写有效 SVG 图标，不支持脚本、style 或外部资源，最多 16KB")
				}
			}
		}
		if key == "content.ignorePatterns" || key == "content.unlistedPatterns" || key == "content.directoryHiddenPatterns" {
			seen := map[string]bool{}
			patterns := []string{}
			for _, line := range strings.Split(v, "\n") {
				p := strings.TrimSpace(line)
				if p == "" || seen[p] {
					continue
				}
				if len(patterns) >= 100 || utf8.RuneCountInString(p) > 500 || strings.HasPrefix(p, "/") || strings.HasPrefix(p, "!") || segment(p, "..") || strings.Contains(p, "\\") || strings.IndexFunc(p, func(c rune) bool { return c < 32 || c == 127 }) >= 0 {
					return nil, errors.New("请填写有效的文章根目录 glob 规则，最多 100 条")
				}
				seen[p] = true
				patterns = append(patterns, p)
			}
			return strings.Join(patterns, "\n"), nil
		}
		if (strings.HasPrefix(key, "api.") || key == "openlist.url") && (field.Type == "url" || field.Type == "endpoint") {
			if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
				u, err := url.Parse(v)
				if err != nil || u.Hostname() == "" || u.User != nil {
					return nil, errors.New("服务地址不能包含账号密码")
				}
			}
			if v != "/" {
				value = strings.TrimRight(v, "/")
			}
		}
	}
	return value, nil
}
func segment(value, target string) bool {
	for _, p := range strings.Split(value, "/") {
		if p == target {
			return true
		}
	}
	return false
}
func (s Store) Save(ctx context.Context, key string, input any) (any, error) {
	value, err := validate(key, input)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	_, err = s.DB.ExecContext(ctx, "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", key, string(raw))
	return value, err
}
func Sensitive(key string) bool {
	for _, field := range fields() {
		if field.Key == key {
			return field.Public != nil && !*field.Public
		}
	}
	return true
}
