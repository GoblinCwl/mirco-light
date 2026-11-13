package httpapi

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCommentManagementAuthorization(t *testing.T) {
	app := &Server{Origin: "https://site.test"}
	for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
		for _, kind := range []string{"comments", "users"} {
			path := "/api/site/admin/comments/" + kind
			if method == "PUT" || method == "DELETE" {
				path += "/7"
			}
			for _, origin := range []string{"https://site.test", "https://evil.test"} {
				req := httptest.NewRequest(method, path, strings.NewReader(`{}`))
				req.Header.Set("Origin", origin)
				res := httptest.NewRecorder()
				app.Handler().ServeHTTP(res, req)
				want := 401
				if method != "GET" && origin != "https://site.test" {
					want = 403
				}
				if res.Code != want {
					t.Fatalf("%s %s %s: got %d want %d", method, path, origin, res.Code, want)
				}
			}
		}
	}
}
