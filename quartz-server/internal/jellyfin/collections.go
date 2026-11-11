package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"golang.org/x/text/collate"
	"golang.org/x/text/language"
	"math"
	"net/url"
	"path"
	"sort"
	"strings"
	"sync"
	"time"
)

type ShareRoot struct{ Physical, Prefix string }

func CollectionSharePath(physical string, roots []ShareRoot) string {
	ordered := append([]ShareRoot{}, roots...)
	sort.SliceStable(ordered, func(i, j int) bool { return len(ordered[i].Physical) > len(ordered[j].Physical) })
	for _, root := range ordered {
		if !Inside(physical, root.Physical) {
			continue
		}
		relative := strings.TrimPrefix(strings.TrimPrefix(physical, root.Physical), "/")
		return path.Join("/", root.Prefix, relative)
	}
	return ""
}

type collectionRow struct{ ID, Path, Name, Type string }
type collectionGroup struct {
	ID, Title string
	Children  []any
}
type CollectionCatalog struct {
	metadataOnce sync.Once
	metadataGate chan struct{}
	metadata     map[string]collectionMetadata
	mu           sync.Mutex
	at           time.Time
	groups       []collectionGroup
	byID, byPath map[string]collectionRow
}

type collectionMetadata struct {
	value map[string]any
	at    time.Time
}

func (c *CollectionCatalog) items(ctx context.Context, ids []string, load func(context.Context, []string) ([]any, error)) (map[string]map[string]any, error) {
	c.metadataOnce.Do(func() { c.metadataGate = make(chan struct{}, 1); c.metadata = map[string]collectionMetadata{} })
	select {
	case c.metadataGate <- struct{}{}:
		defer func() { <-c.metadataGate }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	missing := []string{}
	for _, id := range ids {
		entry, ok := c.metadata[id]
		if !ok || time.Since(entry.at) > time.Minute {
			missing = append(missing, id)
		}
	}
	for start := 0; start < len(missing); start += 100 {
		end := start + 100
		if end > len(missing) {
			end = len(missing)
		}
		items, err := load(ctx, missing[start:end])
		if err != nil {
			return nil, err
		}
		for _, raw := range items {
			item := object(raw)
			id := NormalizeID(text(item["Id"]))
			if id != "" {
				c.metadata[id] = collectionMetadata{item, time.Now()}
			}
		}
	}
	if len(c.metadata) > 2000 {
		for key, entry := range c.metadata {
			if time.Since(entry.at) > time.Minute {
				delete(c.metadata, key)
			}
		}
	}
	result := map[string]map[string]any{}
	for _, id := range ids {
		if entry, ok := c.metadata[id]; ok {
			result[id] = entry.value
		}
	}
	return result, nil
}
func (c *CollectionCatalog) read(ctx context.Context, db *sql.DB) ([]collectionGroup, map[string]collectionRow, map[string]collectionRow, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.at.IsZero() && time.Since(c.at) < time.Minute {
		return c.groups, c.byID, c.byPath, nil
	}
	rows, err := db.QueryContext(ctx, "SELECT Id,Path,Name,Type FROM BaseItems WHERE Type LIKE '%.Movie' OR Type LIKE '%.Series'")
	if err != nil {
		return nil, nil, nil, err
	}
	byID, byPath := map[string]collectionRow{}, map[string]collectionRow{}
	for rows.Next() {
		var row collectionRow
		var physical, name sql.NullString
		if err = rows.Scan(&row.ID, &physical, &name, &row.Type); err != nil {
			rows.Close()
			return nil, nil, nil, err
		}
		row.ID = NormalizeID(row.ID)
		row.Path, row.Name = physical.String, name.String
		byID[row.ID], byPath[row.Path] = row, row
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, nil, err
	}
	rows, err = db.QueryContext(ctx, "SELECT Id,Name,Data FROM BaseItems WHERE Type LIKE '%.BoxSet'")
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()
	groups := []collectionGroup{}
	for rows.Next() {
		var id string
		var name, data sql.NullString
		if err = rows.Scan(&id, &name, &data); err != nil {
			return nil, nil, nil, err
		}
		var value struct {
			LinkedChildren []any `json:"LinkedChildren"`
		}
		if json.Unmarshal([]byte(data.String), &value) != nil || value.LinkedChildren == nil {
			continue
		}
		groups = append(groups, collectionGroup{NormalizeID(id), name.String, value.LinkedChildren})
	}
	if err = rows.Err(); err != nil {
		return nil, nil, nil, err
	}
	c.at, c.groups, c.byID, c.byPath = time.Now(), groups, byID, byPath
	return groups, byID, byPath, nil
}
func (s *Service) Collections(ctx context.Context, body map[string]any) (map[string]any, error) {
	share, err := s.mediaShare(ctx, body)
	if err != nil {
		return nil, err
	}
	physical, err := s.Backend.Authorize(ctx, share.Access, true)
	if err != nil {
		return nil, err
	}
	empty := map[string]any{"collections": []map[string]any{}}
	if physical == "" {
		return empty, nil
	}
	current, err := s.Catalog.Index.Find(ctx, physical, true, false)
	if err != nil {
		return nil, err
	}
	if current == nil {
		current, err = s.Catalog.Index.Find(ctx, physical, false, true)
		if err != nil {
			return nil, err
		}
	}
	if current == nil {
		return empty, nil
	}
	currentID := NormalizeID(text(current["Id"]))
	if current["Type"] == "Season" || current["Type"] == "Episode" {
		currentID = NormalizeID(text(current["SeriesId"]))
	}
	if currentID == "" {
		return empty, nil
	}
	roots := []ShareRoot{}
	for _, source := range share.Files {
		root, err := s.Backend.PhysicalPath(ctx, path.Join(share.Base, source))
		if err != nil {
			return nil, err
		}
		if root != "" {
			prefix := ""
			if len(share.Files) > 1 {
				prefix = path.Base(strings.TrimRight(source, "/"))
			}
			roots = append(roots, ShareRoot{root, prefix})
		}
	}
	groups, byID, byPath, err := s.collectionCatalog.read(ctx, s.Backend.Library)
	if err != nil {
		return nil, err
	}
	type member struct {
		row      collectionRow
		relative string
	}
	type group struct {
		row     collectionGroup
		members []member
	}
	included := []group{}
	candidates := []member{}
	seenCandidate := map[string]bool{}
	for _, g := range groups {
		members := []collectionRow{}
		seen := map[string]bool{}
		contains := false
		for _, raw := range g.Children {
			child := object(raw)
			row, ok := byID[NormalizeID(text(child["ItemId"]))]
			if !ok {
				row, ok = byPath[text(child["Path"])]
			}
			if !ok || seen[row.ID] {
				continue
			}
			seen[row.ID] = true
			members = append(members, row)
			if row.ID == currentID {
				contains = true
			}
		}
		if !contains {
			continue
		}
		next := group{row: g}
		for _, row := range members {
			if row.ID == currentID || row.Path == "" {
				continue
			}
			relative := CollectionSharePath(row.Path, roots)
			if relative == "" {
				continue
			}
			m := member{row, relative}
			next.members = append(next.members, m)
			if !seenCandidate[row.ID] {
				seenCandidate[row.ID] = true
				candidates = append(candidates, m)
			}
		}
		included = append(included, next)
	}
	allowed := map[string]bool{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	cursor := 0
	workers := len(candidates)
	if workers > 4 {
		workers = 4
	}
	baseAccess := share.Access
	baseAccess.Path = "/@s/" + share.ID
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				mu.Lock()
				index := cursor
				cursor++
				mu.Unlock()
				if index >= len(candidates) {
					return
				}
				candidate := candidates[index]
				access := baseAccess
				access.Path += "/" + strings.TrimPrefix(candidate.relative, "/")
				got, err := s.Backend.Authorize(ctx, access, true)
				if err == nil && got == candidate.row.Path {
					mu.Lock()
					allowed[candidate.row.ID] = true
					mu.Unlock()
				}
			}
		}()
	}
	wg.Wait()

	ids := []string{}
	for _, candidate := range candidates {
		if allowed[candidate.row.ID] {
			ids = append(ids, candidate.row.ID)
		}
	}
	metadata, err := s.collectionCatalog.items(ctx, ids, func(ctx context.Context, ids []string) ([]any, error) {
		value, err := s.Backend.request(ctx, "GET", "/Items?"+url.Values{"Ids": {strings.Join(ids, ",")}, "Fields": {"Path"}, "EnableUserData": {"false"}, "CollapseBoxSetItems": {"false"}}.Encode(), nil)
		if err != nil {
			return nil, err
		}
		return list(value["Items"]), nil
	})
	if err != nil {
		return nil, err
	}

	result := []map[string]any{}
	collator := collate.New(language.MustParse("zh-CN"), collate.Numeric)
	for _, g := range included {
		items := []map[string]any{}
		for _, member := range g.members {
			row := member.row
			if !allowed[row.ID] {
				continue
			}
			info := metadata[row.ID]
			title := text(info["Name"])
			if title == "" {
				title = row.Name
			}
			parts := strings.Split(row.Type, ".")
			kind := parts[len(parts)-1]
			entry := map[string]any{"id": row.ID, "title": title, "type": kind, "path": member.relative, "directory": strings.HasSuffix(row.Type, ".Series")}
			if year, ok := info["ProductionYear"]; ok {
				entry["year"] = year
			}
			if tag := text(object(info["ImageTags"])["Primary"]); tag != "" {
				access := baseAccess
				access.Path += "/" + strings.TrimPrefix(member.relative, "/")
				poster, err := s.ImageURL(ctx, row.ID, tag, access, "Primary")
				if err != nil {
					return nil, err
				}
				entry["poster"] = poster
			}
			items = append(items, entry)
		}
		sort.SliceStable(items, func(i, j int) bool {
			left, right := math.Inf(1), math.Inf(1)
			if value := items[i]["year"]; value != nil {
				left = number(value)
			}
			if value := items[j]["year"]; value != nil {
				right = number(value)
			}
			if left != right {
				return left < right
			}
			return collator.CompareString(text(items[i]["title"]), text(items[j]["title"])) < 0
		})
		if len(items) > 0 {
			result = append(result, map[string]any{"id": g.row.ID, "title": g.row.Title, "items": items})
		}
	}
	return map[string]any{"collections": result}, nil
}
