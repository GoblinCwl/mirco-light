package httpapi

import (
	"database/sql"
	"errors"
	"goblincwl/quartz-server/internal/repo"
	"net/http"
	"strings"
)

func (s *Server) repo(mux *http.ServeMux) {
	if s.Repo == nil {
		return
	}
	mux.HandleFunc("GET /api/repo/", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			var problem *repo.Problem
			if errors.As(err, &problem) {
				JSON(w, problem.Status, map[string]string{"error": problem.Message})
			} else {
				JSON(w, 503, map[string]string{"error": "仓库服务暂时不可用"})
			}
		}
		path := strings.TrimPrefix(r.URL.Path, "/api/repo/")
		if path == "avatar" {
			var mime, hash string
			var data []byte
			err := s.DB.QueryRowContext(r.Context(), "SELECT mime,hash,data FROM repo_avatar WHERE id=1").Scan(&mime, &hash, &data)
			if err == sql.ErrNoRows {
				JSON(w, 404, map[string]string{"error": "头像尚未缓存"})
				return
			}
			if err != nil {
				fail(err)
				return
			}
			etag := `"` + hash + `"`
			w.Header().Set("ETag", etag)
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Header().Set("Content-Type", mime)
			if r.Header.Get("If-None-Match") == etag {
				w.WriteHeader(304)
				return
			}
			w.Write(data)
			return
		}
		if path == "catalog" {
			value, err := s.Repo.Catalog(r.Context())
			if err != nil {
				fail(err)
				return
			}
			w.Header().Set("Cache-Control", "no-cache")
			JSON(w, 200, value)
			return
		}
		parts := strings.Split(path, "/")
		if len(parts) != 2 {
			JSON(w, 404, map[string]string{"error": "接口不存在"})
			return
		}
		if parts[1] == "archive" || parts[1] == "raw" {
			if err := s.Repo.Download(w, r, parts[0], parts[1]); err != nil {
				var problem *repo.Problem
				if errors.As(err, &problem) {
					fail(err)
				} else {
					panic(http.ErrAbortHandler)
				}
			}
			return
		}
		value, err := s.Repo.Dispatch(r.Context(), parts[0], parts[1], r.URL.Query())
		if err != nil {
			fail(err)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		JSON(w, 200, value)
	})
}
