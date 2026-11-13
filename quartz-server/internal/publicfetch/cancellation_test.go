package publicfetch

import (
	"context"
	"errors"
	"net/http"
	"testing"
)

type cancelTransport struct{ cancel context.CancelFunc }

func (c cancelTransport) RoundTrip(*http.Request) (*http.Response, error) {
	c.cancel()
	return nil, context.Canceled
}
func TestFetchPreservesCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, err := FetchResponse(ctx, "https://example.com/feed.xml", &http.Client{Transport: cancelTransport{cancel}}, 1024, "application/xml")
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
