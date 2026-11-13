package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"goblincwl/quartz-server/internal/adapters"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/buildcontrol"
	"goblincwl/quartz-server/internal/comments"
	"goblincwl/quartz-server/internal/credentials"
	"goblincwl/quartz-server/internal/jellyfin"
	"goblincwl/quartz-server/internal/monitoring"
	"goblincwl/quartz-server/internal/openlist"
	"goblincwl/quartz-server/internal/repo"
	"goblincwl/quartz-server/internal/taskruns"
	"goblincwl/quartz-server/internal/video"
	"goblincwl/quartz-server/internal/visitors"
	"log/slog"
	"net/http"
	"time"
)

type Server struct {
	TaskRuns          *taskruns.Tracker
	ArticleDirectory  string
	Build             *buildcontrol.Client
	Jellyfin          *jellyfin.Service
	SettingsChanged   func(string)
	CredentialChanged func(string)
	DataChanged       func(string)
	FriendJobsChanged func()
	Comments          *comments.Archive
	Shares            *openlist.Shares
	Monitoring        *monitoring.Manager
	Adapters          *adapters.Manager
	Video             *video.Service
	Credentials       *credentials.Store
	Repo              *repo.Adapter
	OpenList          *openlist.Adapter
	ShareSession      *openlist.Session
	FriendAvatars     *openlist.Avatars
	Visitors          *visitors.Store
	Origin            string
	Auth              *auth.Service
	DB                *sql.DB
	Log               *slog.Logger
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	s.site(mux)
	s.visitors(mux)
	s.openlist(mux)
	s.repo(mux)
	s.video(mux)
	s.adapters(mux)
	s.comments(mux)
	s.jellyfin(mux)
	mux.HandleFunc("GET /index.xml", s.rss)
	routed := s.gateway(mux)
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, r *http.Request) { JSON(w, 200, map[string]any{"ok": true}) })
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.DB.PingContext(ctx); err != nil {
			JSON(w, 503, map[string]any{"ok": false})
			return
		}
		JSON(w, 200, map[string]any{"ok": true})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				alerts.Emit(alerts.Event{Kind: "runtime", Source: "quartz-server", Title: "请求处理发生异常", Message: "后端已捕获异常，请查看服务日志"})
				s.Log.Error("request panic", "path", r.URL.Path)
				JSON(w, 500, map[string]string{"error": "服务暂时不可用"})
			}
		}()
		routed.ServeHTTP(w, r)
	})
}
func JSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
