package httpapi

import (
	"database/sql"
	"errors"
	"goblincwl/quartz-server/internal/taskruns"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) siteTasks(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != "GET" && r.Method != "POST" {
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		return
	}
	tracker := s.TaskRuns
	if tracker == nil {
		tracker = taskruns.New(s.DB)
	}
	if r.Method == "POST" {
		key := strings.TrimSuffix(strings.TrimPrefix(path, "/admin/tasks/"), "/retry")
		if !strings.HasSuffix(path, "/retry") {
			JSON(w, 404, map[string]string{"error": "接口不存在"})
			return
		}
		if err := tracker.Retry(r.Context(), key); err != nil {
			if errors.Is(err, taskruns.ErrRetryUnavailable) || errors.Is(err, taskruns.ErrRetryPending) {
				JSON(w, 409, map[string]string{"error": err.Error()})
			} else {
				s.fail(w, err)
			}
			return
		}
		JSON(w, 202, map[string]any{"queued": true})
		return
	}
	var value map[string]any
	var err error
	if path == "/admin/tasks" {
		value, err = tracker.List(r.Context())
	} else {
		page := 1
		if raw := r.URL.Query().Get("page"); raw != "" {
			page, err = strconv.Atoi(raw)
			if err != nil || page < 1 || page > 100000 {
				JSON(w, 400, map[string]string{"error": "页码无效"})
				return
			}
		}
		value, err = tracker.Detail(r.Context(), strings.TrimPrefix(path, "/admin/tasks/"), page)
	}
	if errors.Is(err, sql.ErrNoRows) {
		JSON(w, 404, map[string]string{"error": "任务不存在"})
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, value)
}
