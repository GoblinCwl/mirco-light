package jellyfin

import (
	"math"
	"sort"
	"strconv"
	"strings"
)

var segmentLabels = map[string]string{"Intro": "片头", "Outro": "片尾", "Recap": "前情回顾", "Preview": "下集预告", "Commercial": "广告", "Unknown": "片段"}

func numericField(value map[string]any, key string) float64 {
	raw, ok := value[key]
	if !ok {
		return math.NaN()
	}
	if raw == nil {
		return 0
	}
	if text, ok := raw.(string); ok {
		if strings.TrimSpace(text) == "" {
			return 0
		}
		n, err := strconv.ParseFloat(text, 64)
		if err != nil {
			return math.NaN()
		}
		return n
	}
	return number(raw)
}
func Timeline(segments, chapters []any, runtimeTicks float64) map[string]any {
	duration := runtimeTicks / 10000000
	out := map[string]any{"duration": duration, "segments": []map[string]any{}, "chapters": []map[string]any{}}
	if !finite(duration) || duration <= 0 {
		out["duration"] = 0
		return out
	}
	segmentByKey := map[string]map[string]any{}
	segmentOrder := []string{}
	for _, raw := range segments {
		item := object(raw)
		start := math.Max(0, numericField(item, "StartTicks")/10000000)
		end := math.Min(duration, numericField(item, "EndTicks")/10000000)
		if !finite(start) || !finite(end) || start >= end {
			continue
		}
		kind := text(item["Type"])
		label, ok := segmentLabels[kind]
		if !ok {
			kind = "Unknown"
			label = segmentLabels[kind]
		}
		key := kind + ":" + numeric(start) + ":" + numeric(end)
		if _, ok := segmentByKey[key]; !ok {
			segmentOrder = append(segmentOrder, key)
		}
		segmentByKey[key] = map[string]any{"start": start, "end": end, "type": kind, "text": label}
	}
	segmentRows := []map[string]any{}
	for _, key := range segmentOrder {
		segmentRows = append(segmentRows, segmentByKey[key])
	}
	sort.SliceStable(segmentRows, func(i, j int) bool { return segmentRows[i]["start"].(float64) < segmentRows[j]["start"].(float64) })
	chapterByTime := map[float64]map[string]any{}
	order := []float64{}
	for index, raw := range chapters {
		item := object(raw)
		at := numericField(item, "StartPositionTicks") / 10000000
		if !finite(at) || at < 0 || at >= duration {
			continue
		}
		name := text(item["Name"])
		if name == "" {
			name = "章节 " + strconv.Itoa(index+1)
		}
		runes := []rune(name)
		if len(runes) > 120 {
			name = string(runes[:120])
		}
		if _, exists := chapterByTime[at]; !exists {
			order = append(order, at)
		}
		chapterByTime[at] = map[string]any{"time": at, "text": name}
	}
	sort.Float64s(order)
	chapterRows := []map[string]any{}
	for _, at := range order {
		chapterRows = append(chapterRows, chapterByTime[at])
	}
	out["segments"], out["chapters"] = segmentRows, chapterRows
	return out
}
