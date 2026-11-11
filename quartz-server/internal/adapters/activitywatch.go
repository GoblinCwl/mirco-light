package adapters

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
)

type Period struct{ Date, Start, End string }

func Periods(now time.Time) []Period {
	local := now.In(time.FixedZone("Asia/Shanghai", 8*3600))
	midnight := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, local.Location())
	periods := []Period{}
	for i := 0; i < 7; i++ {
		start := midnight.AddDate(0, 0, i-6)
		end := start.AddDate(0, 0, 1)
		if end.After(now) {
			end = now
		}
		periods = append(periods, Period{start.Format("2006-01-02"), start.UTC().Format("2006-01-02T15:04:05.000Z"), end.UTC().Format("2006-01-02T15:04:05.000Z")})
	}
	return periods
}
func Aggregate(periods []Period, results []any, categories []any) (map[string]any, error) {
	if len(periods) == 0 || len(results) != len(periods) {
		return nil, errors.New("invalid query period count")
	}
	type rule struct {
		name, color string
		depth       int
		pattern     *regexp.Regexp
	}
	rules := []rule{}
	colorPattern := regexp.MustCompile(`(?i)^#[a-f0-9]{3}(?:[a-f0-9]{3})?$`)
	for _, raw := range categories {
		category := object(raw)
		r := object(category["rule"])
		if r["type"] != "regex" {
			continue
		}
		names := list(category["name"])
		if len(names) == 0 {
			return nil, errors.New("invalid category names")
		}
		pattern, err := regexp.Compile("(?i)" + text(r["regex"]))
		if err != nil {
			return nil, errors.New("unsupported category expression")
		}
		color := text(object(category["data"])["color"])
		if !colorPattern.MatchString(color) {
			color = "#64748b"
		}
		rules = append(rules, rule{text(names[0]), color, len(names), pattern})
	}
	sort.SliceStable(rules, func(i, j int) bool { return rules[i].depth > rules[j].depth })
	type app struct {
		name    string
		seconds float64
	}
	type category struct {
		name, color string
		seconds     float64
		apps        map[string]*app
	}
	totals := map[string]*category{}
	order := []string{}
	days := []map[string]any{}
	totalSeconds := float64(0)
	for index, period := range periods {
		events, ok := results[index].([]any)
		if !ok {
			return nil, errors.New("invalid query result")
		}
		seconds := float64(0)
		for _, raw := range events {
			event := object(raw)
			duration, ok := event["duration"].(float64)
			if !ok || math.IsNaN(duration) || math.IsInf(duration, 0) || duration < 0 {
				return nil, errors.New("invalid duration")
			}
			appPath := text(object(event["data"])["app"])
			parts := strings.FieldsFunc(appPath, func(c rune) bool { return c == '/' || c == '\\' })
			executable := ""
			if len(parts) > 0 {
				executable = strings.TrimSpace(parts[len(parts)-1])
			}
			if strings.EqualFold(executable, "lockapp.exe") {
				continue
			}
			name, color := "未分类", "#94a3b8"
			for _, r := range rules {
				if r.pattern.MatchString(appPath) {
					name, color = r.name, r.color
					break
				}
			}
			current := totals[name]
			if current == nil {
				current = &category{name, color, 0, map[string]*app{}}
				totals[name] = current
				order = append(order, name)
			}
			current.seconds += duration
			if executable == "" {
				executable = "未知应用"
			}
			runes := []rune(executable)
			if len(runes) > 120 {
				executable = string(runes[:120])
			}
			key := strings.ToLower(executable)
			application := current.apps[key]
			if application == nil {
				application = &app{name: executable}
				current.apps[key] = application
			}
			application.seconds += duration
			seconds += duration
		}
		days = append(days, map[string]any{"date": period.Date, "seconds": seconds})
		totalSeconds += seconds
	}
	categoriesOut := []map[string]any{}
	for _, name := range order {
		v := totals[name]
		apps := []map[string]any{}
		for _, application := range v.apps {
			if application.seconds > 0 {
				apps = append(apps, map[string]any{"name": application.name, "seconds": application.seconds})
			}
		}
		sort.SliceStable(apps, func(i, j int) bool {
			a, b := apps[i]["seconds"].(float64), apps[j]["seconds"].(float64)
			if a == b {
				return text(apps[i]["name"]) < text(apps[j]["name"])
			}
			return a > b
		})
		percent := float64(0)
		if totalSeconds > 0 {
			percent = v.seconds / totalSeconds * 100
		}
		categoriesOut = append(categoriesOut, map[string]any{"name": v.name, "seconds": v.seconds, "color": v.color, "percent": percent, "apps": apps})
	}
	sort.SliceStable(categoriesOut, func(i, j int) bool {
		return categoriesOut[i]["seconds"].(float64) > categoriesOut[j]["seconds"].(float64)
	})
	return map[string]any{"startDate": periods[0].Date, "endDate": periods[len(periods)-1].Date, "timezone": "Asia/Shanghai", "totalSeconds": totalSeconds, "daily": days, "categories": categoriesOut}, nil
}
func (m *Manager) collectActivityWatch(ctx context.Context) (map[string]any, error) {
	values, err := m.Settings(ctx)
	if err != nil {
		return nil, err
	}
	base := strings.TrimRight(setting(values, "api.activitywatch.url", "http://host.docker.internal:5600"), "/")
	raw, err := m.request(ctx, "GET", base+"/api/0/settings", nil, nil)
	if err != nil {
		return nil, err
	}
	settings := object(raw)
	raw, err = m.request(ctx, "GET", base+"/api/0/buckets/", nil, nil)
	if err != nil {
		return nil, err
	}
	buckets := object(raw)
	selected := text(values["api.activitywatch.categorySet"])
	if selected == "" {
		if ids := list(settings["active_set_ids"]); len(ids) > 0 {
			selected = text(ids[0])
		}
	}
	var categories []any
	for _, raw := range list(settings["category_sets"]) {
		set := object(raw)
		if set["id"] == selected {
			categories = list(set["categories"])
			break
		}
	}
	if categories == nil {
		categories = list(settings["classes"])
	}
	if len(categories) == 0 {
		return nil, errors.New("no active category rules")
	}
	windows := []string{}
	for name := range buckets {
		if strings.HasPrefix(name, "aw-watcher-window_") {
			windows = append(windows, name)
		}
	}
	if len(windows) != 1 {
		return nil, errors.New("configure a unique window bucket")
	}
	window := windows[0]
	afk := strings.Replace(window, "aw-watcher-window_", "aw-watcher-afk_", 1)
	if buckets[afk] == nil {
		return nil, errors.New("matching AFK bucket missing")
	}
	now := time.Now()
	periods := Periods(now)
	ranges := []string{}
	for _, p := range periods {
		ranges = append(ranges, p.Start+"/"+p.End)
	}
	query := []string{fmt.Sprintf("w = query_bucket(%q);", window), fmt.Sprintf("a = query_bucket(%q);", afk), `a = filter_keyvals(a, "status", ["not-afk"]);`, "w = filter_period_intersect(w, a);", `RETURN = merge_events_by_keys(w, ["app"]);`}
	raw, err = m.request(ctx, "POST", base+"/api/0/query/", map[string]any{"timeperiods": ranges, "query": query}, nil)
	if err != nil {
		return nil, err
	}
	results, ok := raw.([]any)
	if !ok || len(results) != 7 {
		return nil, errors.New("invalid query result")
	}
	summary, err := Aggregate(periods, results, categories)
	if err != nil {
		return nil, err
	}
	raw, err = m.request(ctx, "GET", base+"/api/0/buckets/"+window+"/events?limit=1", nil, nil)
	if err != nil {
		return nil, err
	}
	var last any
	if events := list(raw); len(events) > 0 {
		event := object(events[0])
		if at, err := time.Parse(time.RFC3339Nano, text(event["timestamp"])); err == nil {
			if duration, ok := event["duration"].(float64); ok {
				last = at.Add(time.Duration(duration * float64(time.Second))).UTC().Format("2006-01-02T15:04:05.000Z")
			}
		}
	}
	summary["updatedAt"] = now.UTC().Format("2006-01-02T15:04:05.000Z")
	summary["lastActivity"] = last
	return summary, nil
}
func (m *Manager) RefreshSummary(ctx context.Context) error {
	_, err := m.Cache.Get(ctx, "activitywatch-refresh", 0, false, func(ctx context.Context) (map[string]any, error) {
		value, err := m.collectActivityWatch(ctx)
		if err != nil {
			if previous, readErr := m.Saved(ctx, "activitywatch-summary"); readErr == nil && previous != nil {
				previous["stale"] = true
				_ = m.Save(ctx, "activitywatch-summary", previous)
			}
			return nil, err
		}
		value["stale"] = false
		if err = m.Save(ctx, "activitywatch-summary", value); err != nil {
			return nil, err
		}
		return value, nil
	})
	return err
}
func (m *Manager) Summary(ctx context.Context) (map[string]any, error) {
	value, err := m.Saved(ctx, "activitywatch-summary")
	if err != nil {
		return nil, err
	}
	if value == nil {
		if err = m.RefreshSummary(ctx); err != nil {
			return nil, err
		}
		value, err = m.Saved(ctx, "activitywatch-summary")
		if err != nil {
			return nil, err
		}
	}
	if date, err := time.Parse(time.RFC3339Nano, text(value["updatedAt"])); err != nil || time.Since(date) > 20*time.Minute {
		value["stale"] = true
	}
	out := map[string]any{}
	for _, key := range []string{"startDate", "endDate", "timezone", "totalSeconds", "daily", "categories", "updatedAt", "lastActivity", "stale"} {
		out[key] = value[key]
	}
	return out, nil
}
