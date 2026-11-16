package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNotificationsRequireAdmin(t *testing.T) {
	s := &Server{Origin: "https://site.test"}
	handler := s.Handler()
	for _, path := range []string{"/api/site/admin/notifications", "/api/site/admin/api-token"} {
		method := http.MethodGet
		if path[len(path)-5:] == "token" {
			method = http.MethodPost
		}
		r := httptest.NewRequest(method, path, nil)
		r.Header.Set("Origin", s.Origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 401 {
			t.Fatalf("%s: %d", path, w.Code)
		}
	}
}
