package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMailRecordsRequireAdmin(t *testing.T) {
	s := &Server{Origin: "https://site.test"}
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/site/admin/mail", nil)
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("mail records returned %d without an admin session", w.Code)
	}
	w = httptest.NewRecorder()
	r = httptest.NewRequest(http.MethodPost, "/api/site/admin/mail/retry/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", nil)
	r.Header.Set("Origin", s.Origin)
	s.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("mail retry returned %d without an admin session", w.Code)
	}
}
