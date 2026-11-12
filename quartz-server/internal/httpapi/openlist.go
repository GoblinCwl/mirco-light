package httpapi

import (
	"context"
	"goblincwl/quartz-server/internal/openlist"
	"goblincwl/quartz-server/internal/settings"
	"net/http"
	"time"
)

func (s *Server) openlist(mux *http.ServeMux) {
	if s.OpenList == nil {
		return
	}
	routes := &openlist.Routes{Adapter: s.OpenList, BaseURL: func(ctx context.Context) (string, error) {
		values, err := (settings.Store{DB: s.DB}).Read(ctx, false)
		if err != nil {
			return "", err
		}
		value, _ := values["openlist.url"].(string)
		return value, nil
	}, Client: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	mux.HandleFunc("GET /api/public/quartz/entries", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		entries, err := s.OpenList.Entries(r.Context())
		if err != nil {
			s.fail(w, err)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=30")
		JSON(w, 200, map[string]any{"entries": entries})
	})
	mux.HandleFunc("OPTIONS /api/public/quartz/entries", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/internal/share/route", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			w.WriteHeader(405)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 9*time.Second)
		defer cancel()
		exists, err := routes.Exists(ctx, r.Header.Get("X-Drive-URI"))
		if err != nil {
			w.WriteHeader(503)
			return
		}
		if !exists {
			w.WriteHeader(404)
			return
		}
		w.Header().Set("X-Accel-Redirect", "/_drive_page_shell")
		w.WriteHeader(200)
	})
}
