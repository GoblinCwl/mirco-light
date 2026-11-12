package friendavatar

import (
	"bytes"
	"context"
	"goblincwl/quartz-server/internal/publicfetch"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

func TestFetchPreservesBytesAndRejectsInvalidContent(t *testing.T) {
	var buf bytes.Buffer
	png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	original := append(buf.Bytes(), []byte("animation-frames-preserved-verbatim")...)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Referer") == "" {
			t.Error("missing origin referrer")
		}
		switch r.URL.Path {
		case "/html":
			w.Write([]byte("<html>Forbidden</html>"))
		case "/forbidden":
			w.WriteHeader(403)
		case "/large":
			w.Write(make([]byte, MaxSize+1))
		default:
			w.Write(original)
		}
	}))
	defer server.Close()
	data, mime, ext, err := Fetch(context.Background(), server.URL+"/avatar.png", server.Client())
	if err != nil || mime != "image/png" || ext != "png" || !bytes.Equal(data, original) {
		t.Fatal("image bytes changed", mime, ext, err)
	}
	for _, path := range []string{"/html", "/forbidden", "/large"} {
		if _, _, _, err := Fetch(context.Background(), server.URL+path, server.Client()); err == nil {
			t.Fatal("accepted invalid image", path)
		}
	}
	if _, _, _, err := Fetch(context.Background(), server.URL, nil); err == nil {
		t.Fatal("default fetcher accepted loopback")
	}
}
func TestNetworkAndPathValidation(t *testing.T) {
	for _, raw := range []string{"127.0.0.1", "::1", "::ffff:127.0.0.1", "10.1.1.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "fc00::1", "0.0.0.0", "224.0.0.1"} {
		if publicfetch.PublicIP(netip.MustParseAddr(raw)) {
			t.Fatal("accepted private address", raw)
		}
	}
	if !publicfetch.PublicIP(netip.MustParseAddr("1.1.1.1")) {
		t.Fatal("rejected public address")
	}
	for _, path := range []string{"../secret.png", "a.png", "abc.svg", "/static/a.png"} {
		if Local(Prefix + path) {
			t.Fatal("accepted invalid stored path", path)
		}
	}
}
