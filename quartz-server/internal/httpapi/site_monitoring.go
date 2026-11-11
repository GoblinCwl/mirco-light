package httpapi

import (
	"goblincwl/quartz-server/internal/journal"
	"net/http"
)

func (s *Server) siteMonitoring(w http.ResponseWriter, r *http.Request, path string) {
	switch {
	case path == "/observatory" && r.Method == "GET":
		if s.Monitoring == nil {
			JSON(w, 503, map[string]string{"error": "监控数据暂时不可用"})
			return
		}
		value, err := s.Monitoring.Monitoring(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		authenticated, err := s.Auth.CheckSession(r.Context(), sessionToken(r))
		if err != nil {
			s.fail(w, err)
			return
		}
		value["authenticated"] = authenticated
		JSON(w, 200, value)
	case path == "/observatory/services" && r.Method == "GET":
		if s.Monitoring == nil {
			JSON(w, 503, map[string]string{"error": "服务状态暂时不可用"})
			return
		}
		value, err := s.Monitoring.Services(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"services": value})
	case path == "/observatory/journal" && r.Method == "GET":
		events, err := (journal.Store{DB: s.DB}).Read(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"events": events})
	case path == "/observatory/visitors" && r.Method == "GET":
		if s.Visitors == nil {
			JSON(w, 503, map[string]string{"error": "访客统计尚未迁移"})
			return
		}
		value, err := s.Visitors.Timeline(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, value)

	default:
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	}
}
