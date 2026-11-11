package adapters

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestActivityProjectionPrivacy(t *testing.T) {
	var raw map[string]any
	json.Unmarshal([]byte(`{"token":"private","health":{"aw_status":"AFK","raw":"private"},"scene":{"primary_scene":"hidden","current_focus":{"title":"hidden"},"threads":[{"name":"hidden"}]}}`), &raw)
	status := StatusFromDashboard(raw)
	data, _ := json.Marshal(status)
	if strings.Contains(string(data), "private") || status["scene"] != nil {
		t.Fatal("private status data exposed")
	}
	details := DetailsFromDashboard(raw)
	if details["focus"] != nil || len(details["threads"].([]any)) != 0 {
		t.Fatal("inactive focus exposed")
	}
}
func TestShanghaiPeriodsAndAggregate(t *testing.T) {
	periods := Periods(time.Date(2026, 11, 9, 17, 0, 0, 0, time.UTC))
	if len(periods) != 7 || periods[6].Date != "2026-11-10" || periods[6].Start != "2026-11-09T16:00:00.000Z" {
		t.Fatal("period boundary wrong")
	}
	results := []any{[]any{}, []any{}, []any{}, []any{}, []any{}, []any{}, []any{map[string]any{"duration": float64(60), "data": map[string]any{"app": "C:\\Windows\\LockApp.exe", "title": "private"}}, map[string]any{"duration": float64(120), "data": map[string]any{"app": "code.exe", "title": "private"}}}}
	categories := []any{map[string]any{"name": []any{"工作"}, "rule": map[string]any{"type": "regex", "regex": "code\\.exe"}, "data": map[string]any{"color": "#123456"}}}
	value, err := Aggregate(periods, results, categories)
	if err != nil || value["totalSeconds"] != float64(120) {
		t.Fatal(value, err)
	}
	raw, _ := json.Marshal(value)
	if strings.Contains(string(raw), "private") {
		t.Fatal("window title leaked into aggregate")
	}
}
