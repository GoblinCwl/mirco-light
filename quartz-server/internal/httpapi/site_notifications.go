package httpapi

import (
	"goblincwl/quartz-server/internal/notifications"
	"net/http"
	"strings"
)

func (s *Server) siteNotifications(w http.ResponseWriter, r *http.Request, path string) {
	if s.Credentials == nil {
		JSON(w, 503, map[string]string{"error": "通知服务尚未初始化"})
		return
	}
	store := notifications.Store{DB: s.DB, Key: s.Credentials.Key}
	switch {
	case path == "/admin/notifications" && r.Method == "GET":
		value, err := store.Describe(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, value)
	case strings.HasPrefix(path, "/admin/notifications/retry/") && r.Method == "POST":
		if err := store.Retry(r.Context(), strings.TrimPrefix(path, "/admin/notifications/retry/")); err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]bool{"ok": true})
	default:
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	}
}
