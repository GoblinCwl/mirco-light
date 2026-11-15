package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLegacyArticleFeedRedirectsToNamedFeed(t *testing.T) {
	recorder := httptest.NewRecorder()
	(&Server{}).rss(recorder, httptest.NewRequest(http.MethodGet, "https://site.test/index.xml?type=article", nil))
	if recorder.Code != http.StatusMovedPermanently || recorder.Header().Get("Location") != "/articles.xml" {
		t.Fatal(recorder.Code, recorder.Header())
	}
}
