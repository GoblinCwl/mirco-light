package httpapi

import (
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) siteCommentsAdmin(w http.ResponseWriter, r *http.Request, path string) {
	w.Header().Set("Cache-Control", "no-store")
	if s.Comments == nil || s.Comments.Client == nil {
		JSON(w, 503, map[string]string{"error": "评论服务尚未配置"})
		return
	}
	parts := strings.Split(strings.TrimPrefix(path, "/admin/comments/"), "/")
	if len(parts) < 1 || len(parts) > 2 || (parts[0] != "comments" && parts[0] != "users") {
		JSON(w, 404, map[string]string{"error": "接口不存在"})
		return
	}
	kind := parts[0]
	if len(parts) == 1 && r.Method == "GET" {
		page := 1
		if raw := r.URL.Query().Get("page"); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil {
				JSON(w, 400, map[string]string{"error": "页码无效"})
				return
			}
			page = n
		}
		value, err := s.Comments.AdminList(r.Context(), kind, page, r.URL.Query().Get("search"), r.URL.Query().Get("filter"))
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, value)
		return
	}
	var id int64
	if len(parts) == 2 {
		var err error
		id, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil || id < 1 {
			JSON(w, 400, map[string]string{"error": "记录标识无效"})
			return
		}
	}
	if !((len(parts) == 2 && (r.Method == "PUT" || r.Method == "DELETE")) || (len(parts) == 1 && kind == "users" && r.Method == "POST")) {
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		return
	}
	var input map[string]any
	if r.Method != "DELETE" {
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
	}
	if err := s.Comments.AdminMutate(r.Context(), kind, r.Method, id, input); err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, map[string]bool{"ok": true})
}
