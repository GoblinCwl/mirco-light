package content

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

// Reading returns a bounded opening excerpt, never the complete indexed body.
func (s Store) Reading(ctx context.Context, page int, kind string) (map[string]any, error) {
	if kind != "" && kind != "article" && kind != "repo" && kind != "share" && kind != "video" {
		return nil, errors.New("内容类别无效")
	}
	counts := map[string]int{}
	rows, err := s.DB.QueryContext(ctx, "SELECT type,count(*) FROM content GROUP BY type")
	if err != nil {
		return nil, err
	}
	total := 0
	for rows.Next() {
		var name string
		var count int
		if err = rows.Scan(&name, &count); err != nil {
			rows.Close()
			return nil, err
		}
		counts[name] = count
		if kind == "" || kind == name {
			total += count
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	const size = 12
	pages := max(1, (total+size-1)/size)
	page = min(max(page, 1), pages)
	where := ""
	args := []any{}
	if kind != "" {
		where = " WHERE type=?"
		args = append(args, kind)
	}
	args = append(args, size, (page-1)*size)
	rows, err = s.DB.QueryContext(ctx, "SELECT id,type,href,title,CASE WHEN encrypted=1 THEN '' ELSE LEFT(content,6000) END,CASE WHEN encrypted=1 THEN '' ELSE description END,tags,published_at,updated_at,encrypted FROM content"+where+" ORDER BY coalesce(updated_at,published_at,'') DESC,id LIMIT ? OFFSET ?", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, source, href, title, body, description, rawTags string
		var created, updated *string
		var encrypted bool
		if err = rows.Scan(&id, &source, &href, &title, &body, &description, &rawTags, &created, &updated, &encrypted); err != nil {
			return nil, err
		}
		tags := []string{}
		if err = json.Unmarshal([]byte(rawTags), &tags); err != nil {
			return nil, err
		}
		opening := ""
		truncated := false
		if !encrypted {
			opening = strings.TrimSpace(body)
			if opening == "" {
				opening = description
			}
			opening, truncated = readingExcerpt(opening)
		}
		items = append(items, map[string]any{"id": id, "type": source, "href": href, "title": title, "excerpt": opening, "excerptTruncated": truncated, "tags": tags, "createdAt": created, "updatedAt": updated, "encrypted": encrypted})
	}
	return map[string]any{"items": items, "page": page, "pages": pages, "total": total, "counts": counts}, rows.Err()
}

// Leave enough bounded prose for tall reader cards while retaining the index encryption guards.
func readingExcerpt(value string) (string, bool) {
	value = encryptedTail.ReplaceAllString(encryptedBlock.ReplaceAllString(value, "[加密文本]"), "[加密文本]")
	return clip(value, 2400), len([]rune(value)) > 2400
}
