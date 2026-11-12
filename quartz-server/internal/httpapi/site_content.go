package httpapi

import (
	"errors"
	"goblincwl/quartz-server/internal/content"
	"net/http"
	"strconv"
)

func (s *Server) siteContent(w http.ResponseWriter, r *http.Request, path string) {
	catalog := content.Store{DB: s.DB, Origin: s.Origin, ArticleDirectory: s.ArticleDirectory}
	switch {
	case path == "/content/reading" && r.Method == "GET":
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		value, err := catalog.Reading(r.Context(), page, r.URL.Query().Get("type"))
		if err != nil {
			s.fail(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		JSON(w, 200, value)
	case path == "/content" && r.Method == "GET":
		value, err := catalog.Catalog(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		etag := `"` + value["revision"].(string) + `"`
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "no-cache")
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(304)
			return
		}
		JSON(w, 200, value)
	case path == "/content/search" && r.Method == "GET":
		value, err := catalog.Search(r.Context(), r.URL.Query().Get("q"))
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"results": value})
	case path == "/content/recent" && r.Method == "GET":
		value, err := catalog.Recent(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]any{"items": value})
	case path == "/content/rss" && r.Method == "GET":
		s.rss(w, r)
	case path == "/admin/content-tags" && r.Method == "GET":
		value, err := catalog.Tags(r.Context(), r.URL.Query().Get("id"))
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, value)
	case path == "/admin/content-tags" && (r.Method == "PUT" || r.Method == "DELETE"):
		var input struct {
			ID   string   `json:"id"`
			Tags []string `json:"tags"`
		}
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		value, err := catalog.EditTags(r.Context(), input.ID, input.Tags, r.Method == "DELETE")
		if err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, value)
	case path == "/admin/tag-members" && r.Method == "POST":
		var input struct {
			Tag    string   `json:"tag"`
			IDs    []string `json:"ids"`
			Action string   `json:"action"`
		}
		if err := body(w, r, &input); err != nil {
			s.fail(w, err)
			return
		}
		if input.Action != "add" && input.Action != "remove" {
			s.fail(w, errors.New("操作无效"))
			return
		}
		if err := catalog.ChangeTag(r.Context(), input.Tag, input.IDs, input.Action == "remove"); err != nil {
			s.fail(w, err)
			return
		}
		JSON(w, 200, map[string]bool{"ok": true})

	default:
		JSON(w, 404, map[string]string{"error": "接口不存在"})
	}
}
func (s *Server) rss(w http.ResponseWriter, r *http.Request) {
	value, err := (content.Store{DB: s.DB, Origin: s.Origin, ArticleDirectory: s.ArticleDirectory}).RSS(r.Context())
	if err != nil {
		s.fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write([]byte(value))
}
