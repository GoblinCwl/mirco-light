package httpapi

import (
	"goblincwl/quartz-server/internal/alerts"
	"net/http"
	"strconv"
)

func (s *Server) siteAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		return
	}
	page := 1
	if raw := r.URL.Query().Get("page"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 {
			JSON(w, 400, map[string]string{"error": "页码无效"})
			return
		}
		page = value
	}
	value, err := (alerts.Store{DB: s.DB}).List(r.Context(), page, r.URL.Query().Get("kind"), r.URL.Query().Get("query"))
	if err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, value)
}
