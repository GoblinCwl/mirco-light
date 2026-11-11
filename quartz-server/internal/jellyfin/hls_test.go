package jellyfin

import (
	"context"
	"io"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const vod = "#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:3,\n0.mp4\n#EXTINF:5,\n1.mp4\n#EXTINF:4,\n2.mp4\n"

func TestResumeVariableDurationAndPrerollBarrier(t *testing.T) {
	for _, v := range []struct {
		at   float64
		want string
	}{{0, "0.mp4"}, {3, "1.mp4"}, {7.99, "1.mp4"}, {8, "2.mp4"}, {99, "2.mp4"}} {
		if got := ResumeSegment(vod, v.at); got != v.want {
			t.Fatal(v, got)
		}
	}
	ready := make(chan struct{})
	var count atomic.Int32
	var p Preroll
	p.Warm = func(ctx context.Context, target string) error {
		if !strings.HasSuffix(target, "/1.mp4") {
			t.Error("wrong predecessor", target)
		}
		count.Add(1)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ready:
			return nil
		}
	}
	p.Register(vod, "http://jellyfin/video/list.m3u8")
	var wg sync.WaitGroup
	wg.Add(1)
	done := make(chan error, 2)
	go func() { defer wg.Done(); done <- p.Before(context.Background(), "http://jellyfin/video/2.mp4") }()
	deadline := time.Now().Add(time.Second)
	for count.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if count.Load() != 1 {
		t.Fatal("preparation did not start")
	}
	wg.Add(1)
	go func() { defer wg.Done(); done <- p.Before(context.Background(), "http://jellyfin/video/2.mp4") }()
	select {
	case <-done:
		t.Fatal("fragment crossed preparation barrier")
	case <-time.After(10 * time.Millisecond):
	}
	close(ready)
	wg.Wait()
	for i := 0; i < 2; i++ {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	if count.Load() != 1 {
		t.Fatal("duplicate warm-up", count.Load())
	}
}
func TestColdHLSStartupWaitsForRequestedFragment(t *testing.T) {
	root, _ := url.Parse("http://jellyfin/Videos/item/master.m3u8")
	reads := []string{}
	reader := func(ctx context.Context, target *url.URL) (io.ReadCloser, error) {
		reads = append(reads, target.Path)
		content := "fragment"
		if strings.HasSuffix(target.Path, "master.m3u8") {
			content = "#EXTM3U\nindex.m3u8\n"
		} else if strings.HasSuffix(target.Path, "index.m3u8") {
			content = strings.ReplaceAll(vod, "#EXT-X-MAP:URI=\"init.mp4\"\n", "")
		}
		return io.NopCloser(strings.NewReader(content)), nil
	}
	p := &Preroll{Warm: func(context.Context, string) error { t.Fatal("TS should not warm predecessor"); return nil }}
	if err := PrepareHLS(context.Background(), root, 8, reader, p); err != nil {
		t.Fatal(err)
	}
	if len(reads) != 3 || !strings.HasSuffix(reads[2], "2.mp4") {
		t.Fatal(reads)
	}
}
func TestVTTAlignmentPreservesTimeAndHLSSubtitleMap(t *testing.T) {
	if decodedText([]byte("\ufeffWEBVTT\n")) != "WEBVTT\n" {
		t.Fatal("UTF-8 BOM changed VTT recognition")
	}
	raw := "WEBVTT\n\n00:10.000 --> 00:12.000\n{\\an8}字幕\n"
	vtt := NormalizeTextSubtitle(raw)
	if strings.Contains(vtt, `{\an8}`) || !strings.Contains(vtt, "line:0%,start position:50% align:center") || !strings.Contains(vtt, "00:10.000 --> 00:12.000") {
		t.Fatal(vtt)
	}
	if !strings.Contains(TimedVTT(vtt, 10), "MPEGTS:900000") {
		t.Fatal("native timestamp offset missing")
	}
	for codec, kind := range map[string]string{"subrip": "vtt", "ass": "ass", "pgssub": "pgs", "dvdsub": "image"} {
		if delivery := SubtitleDelivery(map[string]any{"Codec": codec}); delivery.Type != kind {
			t.Fatal(codec, delivery)
		}
	}
}

func TestBilingualVTTUsesBottomAnchorWithoutDroppingLines(t *testing.T) {
	raw := "WEBVTT\n\nRegion: id:subtitle width:80% lines:3 regionanchor:50%,100% viewportanchor:50%,90%\n\n00:00:37.000 --> 00:00:40.230 region:subtitle line:90%\n测试中文\nEnglish caption\n\n00:00:41.660 --> 00:00:46.390 line:10%\nTop caption\n\n00:00:48.290 --> 00:00:51.800 line:90%,start\nExplicit alignment\n"
	normalized := NormalizeTextSubtitle(raw)
	for _, want := range []string{"line:90%,end", "测试中文\nEnglish caption", "line:10%", "line:90%,start", "00:00:37.000 --> 00:00:40.230"} {
		if !strings.Contains(normalized, want) {
			t.Fatalf("lost %q", want)
		}
	}
	if NormalizeTextSubtitle(normalized) != normalized {
		t.Fatal("normalization is not idempotent")
	}
}
