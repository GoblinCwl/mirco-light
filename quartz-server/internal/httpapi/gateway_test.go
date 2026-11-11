package httpapi

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGatewayRequestBoundary(t *testing.T) {
	s := &Server{}
	paths := []struct {
		path, method              string
		status                    int
		cookie, authorization, ip string
	}{
		{"/api/repo/catalog", "GET", 200, "", "", ""},
		{"/api/attendance", "POST", 405, "", "", ""},
		{"/api/site/admin/settings", "PUT", 200, "session=secret", "Bearer abc", ""},
		{"/api/drive/share-update", "POST", 200, "", "Bearer abc", ""},
		{"/api/visitors/visit", "POST", 200, "", "", "203.0.113.7"},
	}
	for _, v := range paths {
		t.Run(v.path, func(t *testing.T) {
			reached := false
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				reached = true
				if r.Header.Get("Cookie") != v.cookie || r.Header.Get("Authorization") != v.authorization || r.Header.Get("X-Visitor-IP") != v.ip || r.Header.Get("X-API-Key") != "" {
					t.Fatal("credential or client IP policy violated")
				}
				body, _ := io.ReadAll(r.Body)
				if string(body) != "{}" {
					t.Fatal("request body changed")
				}
				w.WriteHeader(200)
			})
			r := httptest.NewRequest(v.method, v.path, strings.NewReader("{}"))
			r.Header.Set("Cookie", "session=secret")
			r.Header.Set("Authorization", "Bearer abc")
			r.Header.Set("X-API-Key", "upstream secret")
			r.Header.Set("X-Real-IP", "203.0.113.7")
			r.Header.Set("X-Visitor-IP", "8.8.8.8")
			w := httptest.NewRecorder()
			s.gateway(next).ServeHTTP(w, r)
			if w.Code != v.status || reached != (v.status == 200) {
				t.Fatalf("unexpected status %d", w.Code)
			}
		})
	}
}
func TestGatewayBoundsChunkedBodies(t *testing.T) {
	for _, path := range []string{"/api/site/feedback", "/api/drive/share-update", "/api/public/quartz/jellyfin/playback"} {
		r := httptest.NewRequest("POST", path, strings.NewReader(strings.Repeat("x", 1000001)))
		r.ContentLength = -1
		w := httptest.NewRecorder()
		(&Server{}).gateway(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("oversized body reached handler") })).ServeHTTP(w, r)
		if w.Code != 413 {
			t.Fatalf("%s returned %d", path, w.Code)
		}
	}
}
func TestVisitLimiterRefillAndIsolation(t *testing.T) {
	l := visitLimiter{buckets: map[string]visitBucket{}}
	now := time.Now()
	for i := 0; i < 11; i++ {
		if !l.allow("a", now) {
			t.Fatal("burst rejected")
		}
	}
	if l.allow("a", now) || !l.allow("b", now) || !l.allow("a", now.Add(2*time.Second)) {
		t.Fatal("rate, refill or client isolation broken")
	}
}
func TestGatewayKeepsMediaAndArchiveLongLived(t *testing.T) {
	for _, path := range []string{"/api/public/quartz/jellyfin/stream/s/t", "/api/repo/project/archive", "/api/repo/project/raw"} {
		next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if _, ok := r.Context().Deadline(); ok {
				t.Fatal("download acquired a total deadline")
			}
		})
		(&Server{}).gateway(next).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", path, nil))
	}
}
