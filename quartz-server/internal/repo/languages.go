package repo

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"
)

// Gitea provides Linguist byte counts for the mirrored repository's default branch.
func (a *Adapter) Languages(ctx context.Context, name string) (map[string]any, error) {
	return a.Cache.Get(ctx, "languages:"+name, 10*time.Minute, false, func(ctx context.Context) (map[string]any, error) {
		base, err := a.Origin(ctx)
		if err != nil {
			return nil, err
		}
		raw, err := a.request(ctx, strings.TrimRight(base, "/")+"/api/v1/repos/"+url.PathEscape(a.Owner)+"/"+url.PathEscape(name)+"/languages")
		if err != nil {
			return nil, err
		}
		counts := map[string]int64{}
		if err = json.Unmarshal(raw, &counts); err != nil {
			return nil, err
		}
		for language, count := range counts {
			if count <= 0 {
				delete(counts, language)
			}
		}
		return map[string]any{"languages": counts}, nil
	})
}
