package openlist

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"
	"unicode/utf8"
)

type Metadata struct {
	Tags     []string          `json:"tags"`
	SharedAt string            `json:"sharedAt,omitempty"`
	Order    *int64            `json:"order,omitempty"`
	Comment  bool              `json:"comment"`
	Jellyfin *bool             `json:"jellyfin,omitempty"`
	Aliases  map[string]string `json:"aliases,omitempty"`
}

func ParseMetadata(raw string, strict bool) (Metadata, error) {
	m, err := parseMetadata(raw, strict)
	if err != nil && !strict {
		return Metadata{Tags: []string{}}, nil
	}
	return m, err
}
func parseMetadata(raw string, strict bool) (Metadata, error) {
	result := Metadata{Tags: []string{}}
	if strings.TrimSpace(raw) == "" {
		raw = "{}"
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &values); err != nil || values == nil {
		return result, errors.New("备注必须是 JSON 对象")
	}
	if value, ok := values["tags"]; ok {
		var tags []string
		if err := json.Unmarshal(value, &tags); err != nil || tags == nil {
			return result, errors.New("tags 必须是字符串数组")
		}
		seen := map[string]bool{}
		for _, tag := range tags {
			tag = strings.TrimSpace(tag)
			if tag == "" || seen[tag] {
				continue
			}
			if len(result.Tags) >= 50 || utf8.RuneCountInString(tag) > 100 || strings.IndexFunc(tag, func(c rune) bool { return c < 32 }) >= 0 {
				return result, errors.New("标签格式无效或过长")
			}
			for _, part := range strings.Split(tag, "/") {
				if part == "" || part == "." || part == ".." {
					return result, errors.New("标签格式无效")
				}
			}
			seen[tag] = true
			result.Tags = append(result.Tags, tag)
		}
	}
	if value, ok := values["jellyfin"]; ok {
		var flag bool
		if string(value) == "null" || json.Unmarshal(value, &flag) != nil {
			return result, errors.New("jellyfin 必须是布尔值")
		}
		result.Jellyfin = &flag
	}
	if value, ok := values["order"]; ok {
		var n float64
		if string(value) == "null" || json.Unmarshal(value, &n) != nil || math.IsNaN(n) || math.IsInf(n, 0) || math.Trunc(n) != n || math.Abs(n) > 9007199254740991 {
			return result, errors.New("排序必须是整数")
		}
		v := int64(n)
		result.Order = &v
	}
	if value, ok := values["sharedAt"]; ok {
		var v string
		if json.Unmarshal(value, &v) == nil {
			if date, err := time.Parse(time.RFC3339Nano, v); err == nil {
				result.SharedAt = date.UTC().Format("2006-01-02T15:04:05.000Z")
			}
		}
	}
	if _, ok := values["sharedAt"]; ok && result.SharedAt == "" && strict {
		return result, errors.New("分享时间必须是带时区的有效 ISO 日期")
	}
	if value, ok := values["comment"]; ok {
		var flag bool
		if json.Unmarshal(value, &flag) == nil {
			result.Comment = flag
		}
	}
	if value, ok := values["aliases"]; ok {
		var aliases map[string]string
		if json.Unmarshal(value, &aliases) != nil || aliases == nil || len(aliases) > 2000 {
			return result, errors.New("别名配置无效")
		}
		for path, name := range aliases {
			if !strings.HasPrefix(path, "/") || path == "/" || strings.HasSuffix(path, "/") || len(path) > 2048 || strings.Contains(path, "\\") || strings.IndexFunc(path, func(c rune) bool { return c < 32 || c == 127 }) >= 0 {
				return result, errors.New("别名路径无效")
			}
			for _, part := range strings.Split(path[1:], "/") {
				if part == "" || part == "." || part == ".." {
					return result, errors.New("别名路径无效")
				}
			}
			name = strings.TrimSpace(name)
			if name == "" || utf8.RuneCountInString(name) > 200 || strings.IndexFunc(name, func(c rune) bool { return c < 32 || c == 127 }) >= 0 {
				return result, errors.New("别名格式无效或过长")
			}
			aliases[path] = name
		}
		if len(aliases) > 0 {
			result.Aliases = aliases
		}
	}
	return result, nil
}
