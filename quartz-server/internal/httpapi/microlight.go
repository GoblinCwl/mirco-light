package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/notifications"
	"net/http"
	"strconv"
	"strings"
)

const microLightAPIBase = "/api/microlight/v1"

var microLightScopes = []string{"alerts:read", "feedback:read", "friends:read", "alerts:delete", "friends:review", "feedback:resolve", "friends:failure-mail", "tasks:read", "tasks:retry", "friends:abandon", "friends:auto-review"}

func (s *Server) microLightAPI(mux *http.ServeMux) {
	mux.HandleFunc(microLightAPIBase+"/", func(w http.ResponseWriter, r *http.Request) {
		if s.Credentials == nil {
			JSON(w, 503, map[string]string{"error": "API 服务尚未初始化"})
			return
		}
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || len(parts[1]) > 512 {
			apiUnauthorized(w)
			return
		}
		token, err := (notifications.Store{DB: s.DB, Key: s.Credentials.Key}).Token(r.Context())
		if err != nil {
			JSON(w, 503, map[string]string{"error": "API 鉴权暂时不可用"})
			return
		}
		expected, provided := sha256.Sum256([]byte(token)), sha256.Sum256([]byte(parts[1]))
		if token == "" || subtle.ConstantTimeCompare(expected[:], provided[:]) != 1 {
			apiUnauthorized(w)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, microLightAPIBase+"/")
		if r.Method != http.MethodGet {
			s.microLightWrite(w, r, path)
			return
		}
		if path == "status" {
			JSON(w, 200, map[string]any{"service": "MicroLight", "version": 1, "scopes": microLightScopes})
			return
		}
		pieces := strings.Split(path, "/")
		if len(pieces) > 2 || pieces[0] == "" || (len(pieces) == 2 && pieces[1] == "") {
			http.NotFound(w, r)
			return
		}
		kind := pieces[0]
		if kind == "tasks" {
			suffix := ""
			if len(pieces) == 2 {
				suffix = "/" + pieces[1]
			}
			s.siteTasks(w, r, "/admin/tasks"+suffix)
			return
		}
		if kind != "alerts" && kind != "feedback" && kind != "friends" {
			http.NotFound(w, r)
			return
		}
		if len(pieces) == 2 {
			s.microLightDetail(w, r, kind, pieces[1])
			return
		}
		page := 1
		if raw := r.URL.Query().Get("page"); raw != "" {
			page, err = strconv.Atoi(raw)
			if err != nil || page < 1 || page > 100000 {
				JSON(w, 400, map[string]string{"error": "页码无效"})
				return
			}
		}
		var result any
		switch kind {
		case "alerts":
			result, err = (alerts.Store{DB: s.DB}).List(r.Context(), page, r.URL.Query().Get("kind"), r.URL.Query().Get("q"))
		case "feedback":
			result, err = (community.Store{DB: s.DB}).Feedback(r.Context(), page)
		case "friends":
			var items []community.Friend
			items, err = (community.Store{DB: s.DB}).Friends(r.Context(), false)
			result = map[string]any{"items": items, "total": len(items)}
		}
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, result)
	})
}
func apiUnauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="MicroLight"`)
	JSON(w, 401, map[string]string{"error": "API Token 无效或未提供"})
}
func (s *Server) microLightDetail(w http.ResponseWriter, r *http.Request, kind, id string) {
	var result any
	var err error
	switch kind {
	case "feedback":
		var f community.Feedback
		err = s.DB.QueryRowContext(r.Context(), "SELECT id,email,browser,description,status,created_at FROM feedback WHERE id=?", id).Scan(&f.ID, &f.Email, &f.Browser, &f.Description, &f.Status, &f.CreatedAt)
		result = f
	case "friends":
		var items []community.Friend
		items, err = (community.Store{DB: s.DB}).Friends(r.Context(), false)
		if err == nil {
			err = sql.ErrNoRows
			for _, f := range items {
				if f.ID == id {
					result = f
					err = nil
					break
				}
			}
		}
	case "alerts":
		var n int64
		n, err = strconv.ParseInt(id, 10, 64)
		if err != nil || n < 1 {
			http.NotFound(w, r)
			return
		}
		var a alerts.Record
		err = s.DB.QueryRowContext(r.Context(), "SELECT id,kind,level,source,title,message,target,status_code,first_seen,last_seen,occurrences FROM alerts WHERE id=?", n).Scan(&a.ID, &a.Kind, &a.Level, &a.Source, &a.Title, &a.Message, &a.Target, &a.Code, &a.FirstSeen, &a.LastSeen, &a.Occurrences)
		result = a
	}
	if errors.Is(err, sql.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, result)
}
func (s *Server) siteAPIToken(w http.ResponseWriter, r *http.Request) {
	if s.Credentials == nil {
		JSON(w, 503, map[string]string{"error": "API 服务尚未初始化"})
		return
	}
	store := notifications.Store{DB: s.DB, Key: s.Credentials.Key}
	switch r.Method {
	case http.MethodGet:
		value, err := store.TokenInfo(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		value["basePath"] = microLightAPIBase
		value["scopes"] = microLightScopes
		JSON(w, 200, value)
	case http.MethodPost:
		token, err := store.Rotate(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]string{"token": token})
	default:
		w.Header().Set("Allow", "GET, POST")
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
	}
}

// Only these individual operations are exposed; this token is not an admin session.
func (s *Server) microLightWrite(w http.ResponseWriter, r *http.Request, path string) {
	parts := strings.Split(path, "/")
	var err error
	status := ""
	switch {
	case r.Method == "POST" && path == "friends/auto-review":
		var queued int
		queued, err = (community.Store{DB: s.DB}).EnqueuePendingFriendReviews(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		s.wakeFriendJobs()
		JSON(w, 202, map[string]any{"queued": queued, "scope": "pending-only"})
		return
	case r.Method == "POST" && len(parts) == 3 && parts[0] == "friends" && parts[1] != "" && parts[2] == "auto-review":
		err = (community.Store{DB: s.DB}).EnqueueFriendReview(r.Context(), parts[1])
		if err != nil {
			s.fail(w, err)
			return
		}
		s.wakeFriendJobs()
		JSON(w, 202, map[string]any{"queued": true, "id": parts[1]})
		return
	case r.Method == "POST" && len(parts) == 3 && parts[0] == "tasks" && parts[1] != "" && parts[2] == "retry":
		s.siteTasks(w, r, "/admin/tasks/"+parts[1]+"/retry")
		return
	case r.Method == "DELETE" && len(parts) == 2 && parts[0] == "alerts":
		id, parseErr := strconv.ParseInt(parts[1], 10, 64)
		if parseErr != nil || id < 1 {
			JSON(w, 400, map[string]string{"error": "告警编号无效"})
			return
		}
		var result sql.Result
		result, err = s.DB.ExecContext(r.Context(), "DELETE FROM alerts WHERE id=?", id)
		if err == nil {
			n, _ := result.RowsAffected()
			if n == 0 {
				http.NotFound(w, r)
				return
			}
		}
		status = "已删除"
	case r.Method == "POST" && len(parts) == 3 && parts[0] == "friends" && parts[1] != "" && parts[2] == "approve":
		status = "展示中"
		_, err = (community.Store{DB: s.DB}).UpdateFriend(r.Context(), parts[1], community.Friend{Status: status}, "review", 0)
		if err == nil {
			s.wakeFriendJobs()
		}
	case r.Method == "POST" && len(parts) == 3 && parts[0] == "friends" && parts[1] != "" && parts[2] == "abandon":
		_, err = (community.Store{DB: s.DB}).UpdateFriend(r.Context(), parts[1], community.Friend{}, "abandon", 0)
		status = "已弃用并删除，失败邮件已加入发送队列"

	case r.Method == "POST" && len(parts) == 3 && parts[0] == "friends" && parts[1] != "" && parts[2] == "failure-mail":
		_, err = (community.Store{DB: s.DB}).UpdateFriend(r.Context(), parts[1], community.Friend{}, "failure-mail", 0)
		status = "失败邮件已加入发送队列"

	case r.Method == "POST" && len(parts) == 3 && parts[0] == "feedback" && parts[1] != "" && parts[2] == "resolve":
		status = "已解决"
		err = (community.Store{DB: s.DB}).UpdateFeedback(r.Context(), parts[1], status, false)
	default:
		JSON(w, 405, map[string]string{"error": "不支持此操作"})
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, map[string]any{"ok": true, "id": parts[1], "status": status})
}
