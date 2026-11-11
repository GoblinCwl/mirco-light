package adapters

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type quoteTransport func(*http.Request) (*http.Response, error)

func (f quoteTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestHitokotoCoalescesAndCaches(t *testing.T) {
	var calls atomic.Int32
	m := Manager{Client: &http.Client{Transport: quoteTransport(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		if r.URL.String() != "https://v1.hitokoto.cn/?encode=json" || r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "" {
			t.Error("quote request boundary violated")
		}
		time.Sleep(10 * time.Millisecond)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"hitokoto":"微光","from":"测试"}`))}, nil
	})}}
	var group sync.WaitGroup
	for i := 0; i < 20; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			v, err := m.Hitokoto(context.Background())
			if err != nil || v["hitokoto"] != "微光" {
				t.Error("shared quote failed")
			}
		}()
	}
	group.Wait()
	if calls.Load() != 1 {
		t.Fatal("requests were not coalesced")
	}
}
func TestHitokotoRejectsMalformedUpstream(t *testing.T) {
	for _, body := range []string{`{}`, `{"hitokoto":5}`, `invalid`, strings.Repeat("x", 65537)} {
		m := Manager{Client: &http.Client{Transport: quoteTransport(func(*http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
		})}}
		if _, err := m.Hitokoto(context.Background()); err == nil {
			t.Fatal("invalid upstream accepted")
		}
	}
}
