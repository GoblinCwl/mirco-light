package openlist

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/content"
	"html"
	"path"
	"sort"
	"strings"
	"time"
)

// Content indexes sharing homepages only. Space and descendants never become nodes.
func (s *Shares) Content(ctx context.Context) ([]content.Item, error) {
	items, err := s.Adapter.Content(ctx)
	if err != nil {
		return nil, err
	}
	for index := range items {
		item := &items[index]
		var raw string
		var header, readme sql.NullString
		if err = s.Adapter.DB.QueryRowContext(ctx, "SELECT files_raw,header,readme FROM x_sharing_dbs WHERE id=?", item.SourceID).Scan(&raw, &header, &readme); err != nil {
			return nil, err
		}
		item.ReferenceContent = header.String + "\n" + readme.String
		// Protected HEAD/README provide relations only; never fetch their files.
		if item.Encrypted {
			continue
		}
		value, err := s.IndexCache.Get(ctx, item.SourceID+":"+raw, 5*time.Minute, false, func(ctx context.Context) (map[string]any, error) {
			var paths []string
			if json.Unmarshal([]byte(raw), &paths) != nil || len(paths) == 0 {
				return nil, errors.New("分享目录无效")
			}
			names := []string{}
			if len(paths) == 1 {
				var token string
				if err := s.Adapter.DB.QueryRowContext(ctx, "SELECT value FROM x_setting_items WHERE key='token'").Scan(&token); err != nil {
					return nil, err
				}
				meta, err := s.API(ctx, "fs/get", map[string]any{"path": paths[0], "password": ""}, token)
				if err != nil {
					return nil, err
				}
				if directory, _ := meta["is_dir"].(bool); directory {
					listing, err := s.API(ctx, "fs/list", map[string]any{"path": paths[0], "password": "", "page": 1, "per_page": 0, "refresh": false}, token)
					if err != nil {
						return nil, err
					}
					if rows, ok := listing["content"].([]any); ok {
						for _, row := range rows {
							if name := text(object(row)["name"]); name != "" {
								names = append(names, name)
							}
						}
					}
				} else {
					names = append(names, path.Base(paths[0]))
				}
			} else {
				for _, file := range paths {
					names = append(names, path.Base(file))
				}
			}
			sort.Strings(names)
			return map[string]any{"content": strings.Join(names, "\n")}, nil
		})
		if err != nil {
			return nil, err
		}
		headerText, readmeText := shareMetadataText(header.String), shareMetadataText(readme.String)
		item.Content = strings.TrimSpace(strings.Join([]string{headerText, text(value["content"]), readmeText}, "\n"))
		description := []rune(strings.TrimSpace(strings.Join([]string{headerText, readmeText}, " ")))
		if len(description) > 180 {
			description = description[:180]
		}
		item.Description = string(description)
	}
	return items, nil
}

// Match displayed metadata text; markup is kept separately for link extraction.
func shareMetadataText(source string) string {
	return strings.Join(strings.Fields(html.UnescapeString(htmlTags.ReplaceAllString(blocks.ReplaceAllString(source, ""), " "))), " ")
}
