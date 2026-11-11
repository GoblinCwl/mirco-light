package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"time"
)

const yearsQuery = `query($login:String!){user(login:$login){contributionsCollection{contributionYears}}}`
const contributionsQuery = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){login contributionsCollection(from:$from,to:$to){
 joinedGitHubContribution{occurredAt}
 commitContributionsByRepository(maxRepositories:100){repository{nameWithOwner isPrivate} contributions(first:100){pageInfo{hasNextPage} nodes{occurredAt commitCount}}}
 repositoryContributions(first:100){pageInfo{hasNextPage} nodes{occurredAt repository{nameWithOwner isPrivate}}}
 issueContributions(first:100){pageInfo{hasNextPage} nodes{occurredAt issue{number title repository{nameWithOwner isPrivate}}}}
 pullRequestContributions(first:100){pageInfo{hasNextPage} nodes{occurredAt pullRequest{number title repository{nameWithOwner isPrivate}}}}
 pullRequestReviewContributions(first:100){pageInfo{hasNextPage} nodes{occurredAt pullRequest{number title repository{nameWithOwner isPrivate}}}}
}}}`

func object(value any) map[string]any {
	v, _ := value.(map[string]any)
	if v == nil {
		return map[string]any{}
	}
	return v
}
func list(value any) []any { v, _ := value.([]any); return v }
func (s *Social) graphql(ctx context.Context, query string, variables map[string]any) (map[string]any, error) {
	raw, err := s.Adapter.requestWith(ctx, "https://api.github.com/graphql", map[string]any{"query": query, "variables": variables})
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if json.Unmarshal(raw, &result) != nil || len(list(result["errors"])) > 0 {
		return nil, errors.New("GitHub contribution query failed")
	}
	return result, nil
}
func collection(result map[string]any) map[string]any {
	return object(object(object(result["data"])["user"])["contributionsCollection"])
}
func (s *Social) years(ctx context.Context) ([]int, error) {
	result, err := s.graphql(ctx, yearsQuery, map[string]any{"login": s.Adapter.Owner})
	if err != nil {
		return nil, err
	}
	raw, ok := collection(result)["contributionYears"].([]any)
	if !ok {
		return nil, errors.New("invalid contribution years")
	}
	years := []int{}
	seen := map[int]bool{}
	for _, value := range raw {
		n, ok := value.(float64)
		if !ok || n != float64(int(n)) || n < 2008 || n > 9998 {
			return nil, errors.New("invalid contribution year")
		}
		year := int(n)
		if !seen[year] {
			seen[year] = true
			years = append(years, year)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(years)))
	return years, nil
}

var fullName = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
var datePrefix = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T`)

func NormalizeContributions(result map[string]any) ([]map[string]any, error) {
	if len(list(result["errors"])) > 0 {
		return nil, errors.New("GitHub contribution query failed")
	}
	c := collection(result)
	if len(c) == 0 {
		return nil, errors.New("invalid GitHub contributions")
	}
	rows := []map[string]any{}
	appendRow := func(kind, label string, repository, node map[string]any, text string) {
		if repository["isPrivate"] != false || node["isRestricted"] == true {
			return
		}
		name, date := stringValue(repository["nameWithOwner"]), stringValue(node["occurredAt"])
		if !fullName.MatchString(name) || !datePrefix.MatchString(date) {
			return
		}
		number := node["_number"]
		suffix := ""
		var link any
		if number != nil {
			suffix = numberString(number)
		}
		if n, ok := number.(float64); ok && n > 0 && n == float64(int(n)) && (kind == "issue" || kind == "pull_request" || kind == "review") {
			part := "pull"
			if kind == "issue" {
				part = "issues"
			}
			link = "https://github.com/" + name + "/" + part + "/" + itoa(int(n))
		}
		runes := []rune(text)
		if len(runes) > 240 {
			runes = runes[:240]
		}
		rows = append(rows, map[string]any{"url": link, "id": kind + ":" + name + ":" + date + ":" + suffix, "kind": kind, "label": label, "repository": name, "text": string(runes), "date": date})
	}
	if joined := object(c["joinedGitHubContribution"]); datePrefix.MatchString(stringValue(joined["occurredAt"])) {
		date := stringValue(joined["occurredAt"])
		login := stringValue(object(object(result["data"])["user"])["login"])
		if login == "" {
			login = "GitHub 账号"
		}
		rows = append(rows, map[string]any{"id": "joined:" + date, "kind": "joined", "label": "加入 GitHub", "text": login, "date": date})
	}
	for _, raw := range list(c["commitContributionsByRepository"]) {
		group := object(raw)
		for _, raw := range list(object(group["contributions"])["nodes"]) {
			node := object(raw)
			count, ok := node["commitCount"].(float64)
			if ok && count > 0 && count == float64(int(count)) {
				appendRow("commit", "提交代码", object(group["repository"]), node, fmt.Sprintf("%d 次提交", int(count)))
			}
		}
	}
	for _, raw := range list(object(c["repositoryContributions"])["nodes"]) {
		node := object(raw)
		appendRow("repository", "创建仓库", object(node["repository"]), node, "")
	}
	for _, field := range [][4]string{{"issueContributions", "issue", "创建议题", "issue"}, {"pullRequestContributions", "pull_request", "创建合并请求", "pullRequest"}, {"pullRequestReviewContributions", "review", "审查合并请求", "pullRequest"}} {
		for _, raw := range list(object(c[field[0]])["nodes"]) {
			node := object(raw)
			item := object(node[field[3]])
			copy := map[string]any{}
			for key, v := range node {
				copy[key] = v
			}
			copy["_number"] = item["number"]
			appendRow(field[1], field[2], object(item["repository"]), copy, stringValue(item["title"]))
		}
	}
	sortActivities(rows)
	return rows, nil
}
func overflow(c map[string]any) bool {
	groups := list(c["commitContributionsByRepository"])
	if len(groups) >= 100 {
		return true
	}
	for _, raw := range groups {
		if object(object(object(raw)["contributions"])["pageInfo"])["hasNextPage"] == true {
			return true
		}
	}
	for _, field := range []string{"repositoryContributions", "issueContributions", "pullRequestContributions", "pullRequestReviewContributions"} {
		if object(object(c[field])["pageInfo"])["hasNextPage"] == true {
			return true
		}
	}
	return false
}
func (s *Social) year(ctx context.Context, year int) ([]map[string]any, error) {
	requests := 0
	var fetch func(time.Time, time.Time) ([]map[string]any, error)
	fetch = func(start, end time.Time) ([]map[string]any, error) {
		requests++
		if requests > 4096 {
			return nil, errors.New("contribution range exceeds request budget")
		}
		result, err := s.graphql(ctx, contributionsQuery, map[string]any{"login": s.Adapter.Owner, "from": start.Format("2006-01-02T15:04:05.000Z"), "to": end.Format("2006-01-02T15:04:05.000Z")})
		if err != nil {
			return nil, err
		}
		rows, err := NormalizeContributions(result)
		if err != nil {
			return nil, err
		}
		if !overflow(collection(result)) {
			return rows, nil
		}
		if end.Sub(start) < 2*time.Second {
			return nil, errors.New("contribution range still exceeds API capacity")
		}
		middle := start.Add(end.Sub(start) / 2).Truncate(time.Millisecond)
		left, err := fetch(start, middle)
		if err != nil {
			return nil, err
		}
		right, err := fetch(middle.Add(time.Millisecond), end)
		if err != nil {
			return nil, err
		}
		return append(left, right...), nil
	}
	start := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	rows, err := fetch(start, start.AddDate(1, 0, 0).Add(-time.Millisecond))
	if err != nil {
		return nil, err
	}
	unique := map[string]map[string]any{}
	for _, row := range rows {
		unique[stringValue(row["id"])] = row
	}
	out := []map[string]any{}
	for _, row := range unique {
		out = append(out, row)
	}
	sortActivities(out)
	return out, nil
}

func sortActivities(rows []map[string]any) {
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := stringValue(rows[i]["date"]), stringValue(rows[j]["date"])
		if a == b {
			return stringValue(rows[i]["id"]) < stringValue(rows[j]["id"])
		}
		return a > b
	})
}
