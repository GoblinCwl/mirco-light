package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/go-sql-driver/mysql"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/auth"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

func body(w http.ResponseWriter, r *http.Request, value any) error {
	reader := http.MaxBytesReader(w, r.Body, 1000000)
	defer reader.Close()
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(value); err != nil {
		return errors.New("请求格式无效或过大")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("请求包含多余内容")
	}
	return nil
}
func clientIP(r *http.Request) string {
	if value := r.Header.Get("X-Real-IP"); net.ParseIP(value) != nil {
		return value
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
func sessionToken(r *http.Request) string {
	cookie, err := r.Cookie("quartz_stellar_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}
func (s *Server) fail(w http.ResponseWriter, err error) {
	var authentication *auth.Error
	var db *mysql.MySQLError
	if errors.As(err, &authentication) {
		JSON(w, authentication.Status, map[string]string{"error": authentication.Message})
		return
	}
	if errors.As(err, &db) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) || errors.Is(err, sql.ErrConnDone) || errors.Is(err, sql.ErrNoRows) {
		alerts.Emit(alerts.Event{Kind: "runtime", Source: "本站数据访问", Title: "数据访问失败或处理超时", Message: "请求未能完成，请检查数据库与后端服务"})
		s.Log.Error("database request failed", "kind", "database")
		JSON(w, 503, map[string]string{"error": "服务暂时不可用"})
		return
	}
	JSON(w, 400, map[string]string{"error": err.Error()})
}

type attempt struct {
	Count int
	Until time.Time
}
type limiter struct {
	mu      sync.Mutex
	entries map[string]attempt
}

func (l *limiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.entries == nil {
		l.entries = map[string]attempt{}
	}
	now := time.Now()
	for key, value := range l.entries {
		if !now.Before(value.Until) {
			delete(l.entries, key)
		}
	}
	v, ok := l.entries[ip]
	if !ok {
		if len(l.entries) >= 5000 {
			return false
		}
		v.Until = now.Add(10 * time.Minute)
	}
	if v.Count >= 5 {
		return false
	}
	v.Count++
	l.entries[ip] = v
	return true
}
func (s *Server) site(mux *http.ServeMux) {
	feedbackLimits := &limiter{}
	mux.HandleFunc("/api/site/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/site")
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "DELETE" || r.Method == "PATCH" {
			if r.Header.Get("Origin") != s.Origin {
				JSON(w, 403, map[string]string{"error": "请求来源无效"})
				return
			}
		}
		if path == "/session" && r.Method == "GET" {
			s.identity(w, r)
			return
		}
		if strings.HasPrefix(path, "/admin/") {
			switch path {
			case "/session", "/admin/login", "/admin/totp/confirm", "/admin/totp/finish", "/admin/logout":
			default:
				authenticated := false
				if s.Auth != nil {
					var err error
					authenticated, err = s.Auth.CheckSession(r.Context(), sessionToken(r))
					if err != nil {
						s.fail(w, err)
						return
					}
				}
				if !authenticated {
					JSON(w, 401, map[string]string{"error": "请先登录管理员"})
					return
				}
			}
		}

		switch {
		case path == "/admin/comments-session" && r.Method == "POST":
			w.Header().Set("Cache-Control", "no-store")
			if s.Comments == nil || s.Comments.Client == nil {
				JSON(w, 503, map[string]string{"error": "评论服务尚未配置"})
				return
			}
			value, err := s.Comments.Client.BrowserSession(r.Context())
			if err != nil {
				JSON(w, 503, map[string]string{"error": "评论自动登录暂时不可用"})
				return
			}
			JSON(w, 200, value)
		case strings.HasPrefix(path, "/admin/data/friends"), strings.HasPrefix(path, "/admin/data/feedback"), path == "/friends", strings.HasPrefix(path, "/friends/avatar/"), path == "/friends/apply", path == "/feedback":
			s.siteCommunity(w, r, path, feedbackLimits)
		case strings.HasPrefix(path, "/admin/services"), strings.HasPrefix(path, "/admin/service-credentials"):
			s.siteServices(w, r, path)
		case path == "/admin/tasks" || strings.HasPrefix(path, "/admin/tasks/"):
			s.siteTasks(w, r, path)
		case path == "/admin/alerts":
			s.siteAlerts(w, r)
		case strings.HasPrefix(path, "/admin/data/"):
			s.siteData(w, r, path)
		case strings.HasPrefix(path, "/observatory"):
			s.siteMonitoring(w, r, path)
		case strings.HasPrefix(path, "/content"), path == "/admin/content-tags", path == "/admin/tag-members":
			s.siteContent(w, r, path)
		case path == "/admin/build", strings.HasPrefix(path, "/admin/upstreams"), path == "/settings", strings.HasPrefix(path, "/admin/settings"):
			s.siteConfiguration(w, r, path)
		case strings.HasPrefix(path, "/admin/"):
			s.authentication(w, r, path)
		default:
			JSON(w, 404, map[string]string{"error": "接口不存在"})
		}
	})
}
