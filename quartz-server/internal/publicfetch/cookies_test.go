package publicfetch

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChallengeCookiesAreNotForwardedToRedirectedSubdomain(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/start" {
			if cookie, err := r.Cookie("EO_Bot_Ssid"); err != nil || cookie.Value != "123" {
				t.Error("initial request lost cookie")
			}
			http.Redirect(w, r, "http://cdn.avatar.example.test/image", http.StatusFound)
			return
		}
		if r.Header.Get("Cookie") != "" {
			t.Error("challenge cookie leaked across host redirect")
		}
		w.Write([]byte("image"))
	}))
	defer server.Close()
	client := &http.Client{Transport: &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
	}}}
	defer client.CloseIdleConnections()
	response, err := FetchResponseWithCookies(context.Background(), "http://avatar.example.test/start", client, 100, "image/*", []*http.Cookie{{Name: "EO_Bot_Ssid", Value: "123"}})
	if err != nil || string(response.Data) != "image" {
		t.Fatal(response, err)
	}
	if _, err = FetchResponseWithCookies(context.Background(), server.URL, nil, 100, "image/*", []*http.Cookie{{Name: "EO_Bot_Ssid", Value: "123"}}); err == nil {
		t.Fatal("cookie retry bypassed public-address protection")
	}
}
