package httpapi

import (
	"errors"
	"goblincwl/quartz-server/internal/openlist"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

var commentPage = regexp.MustCompile(`^[1-9]\d{0,5}$`)

func (s *Server) comments(mux *http.ServeMux) {
	if s.Comments != nil {
		mux.HandleFunc("GET /api/comments", func(w http.ResponseWriter, r *http.Request) {
			page := r.URL.Query().Get("page")
			if page == "" {
				page = "1"
			}
			if !commentPage.MatchString(page) {
				JSON(w, 400, map[string]string{"error": "页码无效"})
				return
			}
			number, _ := strconv.Atoi(page)
			value, err := s.Comments.Load(r.Context(), number)
			if err != nil {
				JSON(w, 503, map[string]string{"error": "评论暂时不可用"})
				return
			}
			JSON(w, 200, value)
		})
	}
	if s.Shares == nil {
		return
	}
	for _, operation := range []string{"share-page", "share-create", "share-update", "share-delete"} {
		mux.HandleFunc("POST /api/drive/"+operation, func(w http.ResponseWriter, r *http.Request) {
			if origin := r.Header.Get("Origin"); origin != "" && origin != s.Origin {
				w.WriteHeader(403)
				return
			}
			var input map[string]any
			if err := body(w, r, &input); err != nil || input == nil {
				JSON(w, 400, map[string]any{"code": 400, "message": "请求格式不正确"})
				return
			}
			value, err := s.Shares.Operate(r.Context(), strings.TrimPrefix(r.URL.Path, "/api/drive/"), input, r.Header.Get("Authorization"))
			if err != nil {
				status := 400
				var problem *openlist.Problem
				if errors.As(err, &problem) {
					status = problem.Status
				}
				JSON(w, status, map[string]any{"code": status, "message": err.Error()})
				return
			}
			JSON(w, 200, value)
		})
	}
}
