package httpapi

import (
	"context"
	"net/http"
	"time"
)

func (s *Server) adapters(mux *http.ServeMux) {
	if s.Adapters == nil {
		return
	}
	mux.HandleFunc("GET /api/attendance", func(w http.ResponseWriter, r *http.Request) {
		month := r.URL.Query().Get("month")
		if month == "" {
			month = time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01")
		}
		if parsed, err := time.Parse("2006-01", month); err != nil || parsed.Year() < 1 || parsed.Format("2006-01") != month {
			JSON(w, 400, map[string]string{"error": "月份格式必须为 YYYY-MM"})
			return
		}
		value, err := s.Adapters.Attendance(r.Context(), month)
		if err != nil {
			JSON(w, 503, map[string]string{"error": "星历数据暂时不可用"})
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		months := make([]map[string]any, 0, 3)
		center, _ := time.Parse("2006-01", month)
		for offset := -1; offset <= 1; offset++ {
			adjacent := center.AddDate(0, offset, 0).Format("2006-01")
			item := value
			if offset != 0 {
				item, err = s.Adapters.Attendance(r.Context(), adjacent)
				if err != nil {
					JSON(w, 503, map[string]string{"error": "星历数据暂时不可用"})
					return
				}
			}
			months = append(months, item)
		}
		// Copy the center response: do not create a cycle by embedding it in itself.
		result := make(map[string]any, len(value)+1)
		for key, item := range value {
			result[key] = item
		}
		result["months"] = months
		JSON(w, 200, result)
	})
	endpoints := map[string]func(context.Context) (map[string]any, error){
		"/api/hitokoto":                s.Adapters.Hitokoto,
		"/api/activitywatch":           s.Adapters.Summary,
		"/api/qq-status":               s.Adapters.QQ,
		"/api/activity-status":         func(ctx context.Context) (map[string]any, error) { return s.Adapters.Activity(ctx, false) },
		"/api/activity-status/details": func(ctx context.Context) (map[string]any, error) { return s.Adapters.Activity(ctx, true) },
	}
	for path, load := range endpoints {
		mux.HandleFunc("GET "+path, func(w http.ResponseWriter, r *http.Request) {
			value, err := load(r.Context())
			if err != nil {
				JSON(w, 503, map[string]string{"error": "状态数据暂时不可用"})
				return
			}
			if path == "/api/hitokoto" {
				w.Header().Set("Cache-Control", "no-cache")
			}
			JSON(w, 200, value)
		})
	}
}
