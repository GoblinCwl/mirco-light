package repo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// GitHub contributions omit commits whose email is not linked to the account.
// Supplement them from verified public mirrors, using the existing sync task.
// Keep commit IDs so repeated pulls do not create repeated activity.
func (s *Social) RefreshMirroredActivities(ctx context.Context) error {
	s.mirrorMu.Lock()
	defer s.mirrorMu.Unlock()
	catalog, err := s.Adapter.Catalog(ctx)
	if err != nil {
		return err
	}
	saved, err := s.get(ctx, "mirror-commits:v1")
	if err != nil {
		return err
	}
	public := map[string]bool{}
	rows := map[string]map[string]any{}
	for _, item := range catalog["repositories"].([]map[string]any) {
		name := stringValue(item["name"])
		repository := s.Adapter.Owner + "/" + name
		public[repository] = true
		directory, err := confined(s.Adapter.Root, name)
		if err != nil {
			return err
		}
		raw, _, err := Git(ctx, directory, MaxText, nil, "log", "--branches", "-z", "--max-count=100", "--format=%H%x00%an%x00%cI")
		if err != nil {
			return err
		}
		for _, row := range mirroredCommits(string(raw), repository, s.Adapter.Owner) {
			rows[stringValue(row["id"])] = row
		}
	}
	for _, value := range list(saved) {
		row := object(value)
		if public[stringValue(row["repository"])] {
			id := stringValue(row["id"])
			if _, exists := rows[id]; !exists {
				rows[id] = row
			}
		}
	}
	result := []map[string]any{}
	for _, row := range rows {
		result = append(result, row)
	}
	sortActivities(result)
	old, _ := json.Marshal(saved)
	current, _ := json.Marshal(result)
	if bytes.Equal(old, current) {
		return nil
	}
	if err := s.put(ctx, "mirror-commits:v1", result); err != nil {
		return err
	}
	s.Adapter.Cache.Invalidate()
	return nil
}

func mirroredCommits(raw, repository, owner string) []map[string]any {
	rows := []map[string]any{}
	fields := strings.Split(strings.TrimRight(raw, "\x00"), "\x00")
	for i := 0; i+2 < len(fields); i += 3 {
		sha, author, date := fields[i], fields[i+1], fields[i+2]
		at, err := time.Parse(time.RFC3339, date)
		if err != nil || !shaPattern.MatchString(sha) || !strings.EqualFold(commitAuthor(author), owner) {
			continue
		}
		rows = append(rows, map[string]any{"id": "mirror:" + repository + ":" + sha, "repository": repository, "date": at.UTC().Format(time.RFC3339), "url": "https://github.com/" + repository + "/commit/" + url.PathEscape(sha)})
	}
	return rows
}

func mergeMirrorActivities(contributions, commits any) []map[string]any {
	rows := []map[string]any{}
	groups := map[string][]map[string]any{}
	dayKey := func(row map[string]any) string {
		at, err := time.Parse(time.RFC3339, stringValue(row["date"]))
		if err != nil {
			return ""
		}
		return strings.ToLower(stringValue(row["repository"])) + ":" + at.UTC().Format("2006-01-02")
	}
	seen := map[string]bool{}
	for _, value := range list(commits) {
		row := object(value)
		id := stringValue(row["id"])
		key := dayKey(row)
		if key != "" && !seen[id] {
			groups[key] = append(groups[key], row)
			seen[id] = true
		}
	}
	for _, value := range list(contributions) {
		row := object(value)
		if stringValue(row["kind"]) == "commit" {
			key := dayKey(row)
			if group := groups[key]; len(group) > 0 {
				var count int
				// Contribution totals can include commits older than the recent Git scan.
				if n, _ := fmt.Sscanf(stringValue(row["text"]), "%d 次提交", &count); n == 1 && count >= len(group) {
					delete(groups, key)
				} else {
					continue
				}
			}
		}
		rows = append(rows, row)
	}
	for key, group := range groups {
		sortActivities(group)
		latest := group[0]
		rows = append(rows, map[string]any{"id": "commit:" + key, "kind": "commit", "label": "提交代码", "repository": latest["repository"], "date": latest["date"], "url": latest["url"], "text": fmt.Sprintf("%d 次提交", len(group))})
	}
	sortActivities(rows)
	return rows
}
