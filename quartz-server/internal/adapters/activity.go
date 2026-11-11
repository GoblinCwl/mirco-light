package adapters

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"
)

func StatusFromDashboard(result map[string]any) map[string]any {
	states := map[string][2]string{"ACTIVE": {"active", "活跃"}, "AFK": {"afk", "暂离"}, "OFFLINE": {"offline", "离线"}}
	state, ok := states[text(object(result["health"])["aw_status"])]
	if !ok {
		state = [2]string{"unknown", "状态未知"}
	}
	var scene any
	if state[0] == "active" {
		if value, ok := trimmed(object(result["scene"])["primary_scene"], 160).(string); ok && value != "" {
			scene = value
		}
	}
	return map[string]any{"state": state[0], "label": state[1], "scene": scene, "updatedAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}
}
func thread(value any) any {
	if value == nil {
		return nil
	}
	v, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	return map[string]any{"name": trimmed(v["name"], 240), "role": trimmed(v["role"], 240), "confidence": number(v["confidence"]), "startedAt": timestamp(v["started_at"]), "lastActiveAt": timestamp(v["last_active_at"]), "endedAt": timestamp(v["ended_at"])}
}
func DetailsFromDashboard(result map[string]any) map[string]any {
	out := StatusFromDashboard(result)
	scene, health := object(result["scene"]), object(result["health"])
	active := out["state"] == "active"
	var focus any
	if v, ok := scene["current_focus"].(map[string]any); ok && active {
		focus = map[string]any{"app": trimmed(v["app"], 240), "title": trimmed(v["title"], 500), "category": trimmed(v["category"], 240), "durationSeconds": number(v["duration_seconds"]), "timestamp": timestamp(v["timestamp"])}
	}
	threads := []any{}
	if active {
		for _, raw := range list(scene["threads"]) {
			if len(threads) == 12 {
				break
			}
			if v := thread(raw); v != nil {
				threads = append(threads, v)
			}
		}
	}
	profiles := []map[string]any{}
	if active {
		for name, raw := range object(scene["category_profile"]) {
			if v, ok := number(raw).(float64); ok {
				if v > 1 {
					v = 1
				}
				profiles = append(profiles, map[string]any{"name": trimmed(name, 240), "share": v})
			}
		}
	}
	sortProfiles(profiles)
	if len(profiles) > 20 {
		profiles = profiles[:20]
	}
	communication := object(scene["communication"])
	apps := []any{}
	for _, raw := range list(communication["apps"]) {
		if len(apps) == 12 {
			break
		}
		if app, ok := trimmed(raw, 240).(string); ok && app != "" {
			apps = append(apps, app)
		}
	}
	recent := []map[string]any{}
	for _, raw := range list(result["recent_activities"]) {
		if len(recent) == 30 {
			break
		}
		v := object(raw)
		recent = append(recent, map[string]any{"app": trimmed(v["app"], 240), "title": trimmed(v["title"], 500), "category": trimmed(v["category"], 240), "timestamp": timestamp(v["timestamp"]), "durationSeconds": number(v["duration_seconds"]), "eventCount": number(v["event_count"])})
	}
	out["focus"] = focus
	out["threads"] = threads
	out["categoryProfile"] = profiles
	out["profileWindowSeconds"] = number(scene["profile_window_seconds"])
	out["sceneUpdatedAt"] = timestamp(scene["scene_updated_at"])
	out["communication"] = map[string]any{"active": active && communication["active"] == true, "seconds": number(communication["active_seconds"]), "apps": apps}
	out["previousScene"] = thread(result["previous_scene"])
	out["recentActivities"] = recent
	out["health"] = map[string]any{"running": health["running"] == true, "connected": health["aw_connected"] == true, "lastScanAt": timestamp(health["last_scan_at"]), "scanIntervalSeconds": number(health["scan_interval_seconds"]), "uptimeSeconds": number(health["uptime_seconds"])}
	return out
}
func (m *Manager) Activity(ctx context.Context, details bool) (map[string]any, error) {
	value, err := m.Cache.Get(ctx, "activity-dashboard", time.Second, false, func(ctx context.Context) (map[string]any, error) {
		values, err := m.Settings(ctx)
		if err != nil {
			return nil, err
		}
		key := text(values["api.astrbot.token"])
		if key == "" {
			return nil, errors.New("请在服务接入配置 AstrBot API Key")
		}
		raw, err := m.request(ctx, "GET", strings.TrimRight(setting(values, "api.astrbot.url", "http://astrbot:6185"), "/")+"/api/v1/plugins/extensions/astrbot_plugin_scene_aw/dashboard/state", nil, map[string]string{"X-API-Key": key})
		if err != nil {
			return nil, err
		}
		return object(raw), nil
	})
	if err != nil {
		value = map[string]any{"health": map[string]any{"aw_status": "OFFLINE"}}
	}
	if details {
		return DetailsFromDashboard(value), nil
	}
	return StatusFromDashboard(value), nil
}

func sortProfiles(rows []map[string]any) {
	sort.SliceStable(rows, func(i, j int) bool { return rows[i]["share"].(float64) > rows[j]["share"].(float64) })
}
