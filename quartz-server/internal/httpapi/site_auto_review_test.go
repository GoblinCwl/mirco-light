package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAutomaticFriendReviewRequiresAdministrator(t *testing.T) {
	app := &Server{Origin: "https://site.test"}
	for _, action := range []string{"auto-review", "avatar-refresh"} {
		for _, c := range []struct {
			origin string
			want   int
		}{{"https://site.test", 401}, {"https://evil.test", 403}} {
			req := httptest.NewRequest(http.MethodPut, "/api/site/admin/data/friends/fixture/"+action, strings.NewReader(`{}`))
			req.Header.Set("Origin", c.origin)
			res := httptest.NewRecorder()
			app.Handler().ServeHTTP(res, req)
			if res.Code != c.want {
				t.Fatal(c, res.Code, res.Body.String())
			}
		}
	}

}

func TestTaskRetryRequiresAdministrator(t *testing.T) {
	app := &Server{Origin: "https://site.test"}
	for _, c := range []struct {
		origin string
		want   int
	}{{"https://site.test", 401}, {"https://evil.test", 403}} {
		req := httptest.NewRequest(http.MethodPost, "/api/site/admin/tasks/friends-refresh/retry", strings.NewReader(`{}`))
		req.Header.Set("Origin", c.origin)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != c.want {
			t.Fatal(c, res.Code)
		}
	}
}
