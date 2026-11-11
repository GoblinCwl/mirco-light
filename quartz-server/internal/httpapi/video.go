package httpapi

import (
	"database/sql"
	"errors"
	"goblincwl/quartz-server/internal/video"
	"net/http"
	"strings"
)

func (s *Server) video(mux *http.ServeMux) {
	if s.Video == nil {
		return
	}
	fail := func(w http.ResponseWriter, err error) {
		var problem *video.Problem
		if errors.As(err, &problem) {
			JSON(w, problem.Status, map[string]string{"error": problem.Message})
		} else {
			JSON(w, 503, map[string]string{"error": "视频服务暂时不可用"})
		}
	}
	mux.HandleFunc("GET /api/bilibili", func(w http.ResponseWriter, r *http.Request) {
		value, err := s.Video.Store.Library(r.Context(), false)
		if err != nil {
			fail(w, err)
			return
		}
		JSON(w, 200, value)
	})
	mux.HandleFunc("GET /api/video/", func(w http.ResponseWriter, r *http.Request) {
		switch strings.TrimPrefix(r.URL.Path, "/api/video/") {
		case "library", "videos":
			value, err := s.Video.Store.Library(r.Context(), strings.HasSuffix(r.URL.Path, "/library"))
			if err != nil {
				fail(w, err)
				return
			}
			JSON(w, 200, value)
		case "detail":
			value, err := s.Video.Detail(r.Context(), r.URL.Query().Get("bvid"))
			if err != nil {
				fail(w, err)
				return
			}
			w.Header().Set("Cache-Control", "no-cache")
			JSON(w, 200, value)
		case "avatar":
			var mime, hash string
			var data []byte
			err := s.DB.QueryRowContext(r.Context(), "SELECT mime,hash,data FROM video_assets WHERE name='avatar'").Scan(&mime, &hash, &data)
			if err == sql.ErrNoRows {
				w.WriteHeader(404)
				return
			}
			if err != nil {
				fail(w, err)
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
		default:
			JSON(w, 404, map[string]string{"error": "接口不存在"})
		}
	})
}
