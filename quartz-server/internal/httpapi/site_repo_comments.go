package httpapi

import (
	"context"
	"database/sql"
	"goblincwl/quartz-server/internal/comments"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (s *Server) siteRepoComments(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "PUT" {
		JSON(w, 405, map[string]string{"error": "请求方式不支持"})
		return
	}
	if s.Comments == nil || s.Comments.Client == nil {
		JSON(w, 503, map[string]string{"error": "评论服务尚未配置"})
		return
	}
	slug := r.URL.Query().Get("slug")
	if !strings.HasPrefix(slug, "Repo/") || len(strings.Split(slug, "/")) != 2 {
		JSON(w, 400, map[string]string{"error": "仓库参数无效"})
		return
	}
	var title, href string
	err := s.DB.QueryRowContext(r.Context(), "SELECT title,href FROM content WHERE type='repo' AND slug=? AND encrypted=0", slug).Scan(&title, &href)
	if err == sql.ErrNoRows {
		JSON(w, 404, map[string]string{"error": "仓库不存在"})
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	// Always derive Artalk's page key from the indexed public path, never caller input.
	u, err := url.Parse(href)
	if err != nil || u.IsAbs() || !strings.HasPrefix(u.Path, "/Repo/") {
		JSON(w, 400, map[string]string{"error": "仓库评论地址无效"})
		return
	}
	key := u.EscapedPath()
	if r.Method == "PUT" {
		var input struct {
			Comment *bool `json:"comment"`
		}
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		if input.Comment == nil {
			JSON(w, 400, map[string]string{"error": "请选择评论权限"})
			return
		}
		if err := s.Comments.Client.Permission(r.Context(), s.Comments.Site, comments.Permission{Key: key, Title: title, AdminOnly: !*input.Comment}); err != nil {
			s.fail(w, err)
			return
		}
		s.Comments.Cache.Invalidate()
		JSON(w, 200, map[string]any{"key": key, "title": title, "comment": *input.Comment})
		return
	}
	value, err := s.Comments.Cache.Get(r.Context(), "repo-permission:"+key, time.Minute, false, func(ctx context.Context) (map[string]any, error) {
		page, err := s.Comments.Client.FindPage(ctx, s.Comments.Site, key)
		if err != nil {
			return nil, err
		}
		return map[string]any{"key": key, "title": title, "comment": page == nil || page["admin_only"] != true}, nil
	})
	if err != nil {
		s.fail(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	JSON(w, 200, value)
}
