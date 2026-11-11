package video

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transport func(*http.Request) (*http.Response, error)

func (f transport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestDetailAuthorityAndUnavailable(t *testing.T) {
	client := &Client{HTTP: &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		body := `{"code":0,"data":{"bvid":"BV1ua4W6XEJd","owner":{"mid":123},"desc":"<b>简介</b>","pages":[{"cid":100,"page":1,"part":"第一集","duration":60}],"stat":{"view":10,"danmaku":1}}}`
		if r.URL.Query().Get("bvid") == "BV1xx411c7mD" {
			body = `{"code":-404}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
	})}}
	detail, err := client.Detail(context.Background(), "BV1ua4W6XEJd", "123", "")
	if err != nil || detail["description"] != "简介" {
		t.Fatal("detail failed", err)
	}
	if _, err = client.Detail(context.Background(), "BV1ua4W6XEJd", "999", ""); err == nil {
		t.Fatal("foreign video accepted")
	}
	unavailable, err := client.Detail(context.Background(), "BV1xx411c7mD", "123", "")
	if err != nil || unavailable["availability"] != "unavailable" {
		t.Fatal("unavailable video handling failed", err)
	}
	raw, _ := json.Marshal(unavailable)
	if strings.Contains(string(raw), "token") {
		t.Fatal("credential in detail response")
	}
}
