package friendavatar

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const edgeFixture = `<script>var e={X:582728290,Y:1678840428,add:function(a,n){return a+n},Z:499053046};t=f(t,3081175040);document["cookie"]="__tst_status=";var c="EO_Bot_Ssid=";setTimeout("location.reload()",0x4b0);</script>`

func TestEdgeOneCookieParsingIsRestricted(t *testing.T) {
	cookies := edgeOneCookies([]byte(edgeFixture))
	if len(cookies) != 2 || cookies[0].Name != "__tst_status" || cookies[0].Value != "2760621764#" || cookies[1].Value != "3081175040" {
		t.Fatal(cookies)
	}
	for _, body := range []string{"<html>blocked</html>", strings.Repeat("x", 8193) + edgeFixture, strings.ReplaceAll(edgeFixture, "a+n", "a^n"), strings.ReplaceAll(edgeFixture, "X:582728290", "X:4294967296"), strings.ReplaceAll(edgeFixture, "Z:499053046", "Z:499053046,W:7"), strings.ReplaceAll(edgeFixture, "EO_Bot_Ssid=", "unknown=")} {
		if len(edgeOneCookies([]byte(body))) != 0 {
			t.Fatal("accepted unknown challenge")
		}
	}
}
func TestFetchAvatarCompletesCookieChallengeAndRejectsHTML(t *testing.T) {
	var imageData bytes.Buffer
	png.Encode(&imageData, image.NewRGBA(image.Rect(0, 0, 200, 200)))
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path == "/html" {
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte("<html>maintenance</html>"))
			return
		}
		status, _ := r.Cookie("__tst_status")
		session, _ := r.Cookie("EO_Bot_Ssid")
		if r.URL.Path != "/never" && status != nil && session != nil && status.Value == "2760621764#" && session.Value == "3081175040" {
			w.Header().Set("Content-Type", "image/png")
			w.Write(imageData.Bytes())
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(edgeFixture))
	}))
	defer server.Close()
	data, mime, ext, err := Fetch(context.Background(), server.URL+"/icon.png", server.Client())
	if err != nil || calls != 2 || mime != "image/png" || ext != "png" || !bytes.Equal(data, imageData.Bytes()) {
		t.Fatal("did not fetch actual PNG", calls, mime, ext, err)
	}
	calls = 0
	if _, _, _, err = Fetch(context.Background(), server.URL+"/never", server.Client()); err == nil || !strings.Contains(err.Error(), "验证页") || calls != 2 {
		t.Fatal("challenge retries must be bounded and reported clearly", calls, err)
	}
	if _, _, _, err = Fetch(context.Background(), server.URL+"/html", server.Client()); err == nil || !strings.Contains(err.Error(), "网页") {
		t.Fatal("HTML misreported as unsupported image", err)
	}
}
