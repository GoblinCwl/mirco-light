package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCommentSessionRequiresAdministratorAndSameOrigin(t *testing.T) {
	app := &Server{Origin: "https://site.test"}
	for _, c := range []struct {
		origin string
		want   int
	}{{"https://site.test", 401}, {"https://evil.test", 403}} {
		req := httptest.NewRequest(http.MethodPost, "/api/site/admin/comments-session", strings.NewReader(`{}`))
		req.Header.Set("Origin", c.origin)
		res := httptest.NewRecorder()
		app.Handler().ServeHTTP(res, req)
		if res.Code != c.want {
			t.Fatalf("got %d want %d", res.Code, c.want)
		}
	}
}
