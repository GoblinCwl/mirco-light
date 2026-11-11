package httpapi

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// The edge supplies a verified X-Real-IP and removes caller-supplied visitor
// IPs. Endpoint policy lives here rather than one Nginx location per API.
func (s *Server) gateway(next http.Handler) http.Handler {
	visits := &visitLimiter{buckets: map[string]visitBucket{}}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if !strings.HasPrefix(path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		readonly := publicRead(path)
		if readonly && r.Method != "GET" && r.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			JSON(w, 405, map[string]string{"error": "请求方式不支持"})
			return
		}
		r.Header.Del("X-API-Key")
		if !strings.HasPrefix(path, "/api/site/") {
			r.Header.Del("Cookie")
		}
		if readonly || path == "/api/visitors/visit" {
			r.Header.Del("Authorization")
		}
		r.Header.Del("X-Visitor-IP")
		if path == "/api/visitors/visit" && r.Method == "POST" {
			ip := clientIP(r)
			r.Header.Set("X-Visitor-IP", ip)
			if !visits.allow(ip, time.Now()) {
				w.Header().Set("Retry-After", "2")
				JSON(w, 429, map[string]string{"error": "请求过于频繁"})
				return
			}
		}
		if r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" || r.Method == "DELETE" {
			limit := int64(1000000)
			if strings.HasPrefix(path, "/api/drive/share-") {
				limit = 128 << 10
			}
			if strings.HasPrefix(path, "/api/public/quartz/jellyfin/") {
				limit = 65536
			}
			if r.ContentLength > limit {
				JSON(w, 413, map[string]string{"error": "请求内容过大"})
				return
			}
			if r.Body != nil {
				data, err := io.ReadAll(io.LimitReader(r.Body, limit+1))
				r.Body.Close()
				if err != nil {
					JSON(w, 400, map[string]string{"error": "请求内容读取失败"})
					return
				}
				if int64(len(data)) > limit {
					JSON(w, 413, map[string]string{"error": "请求内容过大"})
					return
				}
				r.Body = io.NopCloser(bytes.NewReader(data))
			}
		}
		// Media, bitrate tests and repository downloads intentionally have no total
		// deadline: the proxy's idle timeout and upstream cancellation protect them.
		stream := strings.HasPrefix(path, "/api/public/quartz/jellyfin/") || strings.HasPrefix(path, "/api/repo/") && (strings.HasSuffix(path, "/archive") || strings.HasSuffix(path, "/raw"))
		if !stream {
			timeout := 120 * time.Second
			switch {
			case path == "/api/visitors" || path == "/api/visitors/records" || path == "/api/visitors/visit":
				timeout = 5 * time.Second
			case path == "/api/hitokoto":
				timeout = 10 * time.Second
			case strings.HasPrefix(path, "/api/drive/share-"):
				timeout = 60 * time.Second
			}
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}
func publicRead(path string) bool {
	switch path {
	case "/api/hitokoto", "/api/activitywatch", "/api/qq-status", "/api/attendance", "/api/activity-status", "/api/activity-status/details", "/api/comments", "/api/bilibili", "/api/visitors", "/api/visitors/records":
		return true
	}
	return strings.HasPrefix(path, "/api/repo/") || strings.HasPrefix(path, "/api/video/")
}

type visitBucket struct {
	tokens float64
	at     time.Time
}
type visitLimiter struct {
	mu      sync.Mutex
	buckets map[string]visitBucket
}

func (l *visitLimiter) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[ip]
	if !ok {
		if len(l.buckets) >= 5000 {
			for key, value := range l.buckets {
				if now.Sub(value.at) > 2*time.Minute {
					delete(l.buckets, key)
				}
			}
			if len(l.buckets) >= 5000 {
				return false
			}
		}
		b = visitBucket{tokens: 11, at: now}
	}
	b.tokens += now.Sub(b.at).Seconds() / 2
	if b.tokens > 11 {
		b.tokens = 11
	}
	b.at = now
	allowed := b.tokens >= 1
	if allowed {
		b.tokens--
	}
	l.buckets[ip] = b
	return allowed
}
