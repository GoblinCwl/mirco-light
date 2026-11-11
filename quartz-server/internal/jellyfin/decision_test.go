package jellyfin

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

// Captured from the deployed JavaScript adapter before its removal. These cases
// cover all quality grades, subtitle burn-in, compatibility and audio selection.
func TestPlaybackRequestLegacyContract(t *testing.T) {
	raw, err := os.ReadFile("testdata/playback.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input  PlaybackOptions `json:"input"`
		Output map[string]any  `json:"output"`
	}
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) != 48 {
		t.Fatal("incomplete oracle")
	}
	for i, c := range cases {
		got, err := PlaybackRequest(c.Input)
		if err != nil {
			t.Fatalf("case %d: %v", i, err)
		}
		normalized, _ := json.Marshal(got)
		var decoded map[string]any
		json.Unmarshal(normalized, &decoded)
		if !reflect.DeepEqual(decoded, c.Output) {
			t.Fatalf("case %d differs from legacy negotiation\n%s", i, normalized)
		}
	}
}
func TestSourceAssetScopeAndDirectPreference(t *testing.T) {
	item := strings.Repeat("a", 32)
	base := "http://jellyfin:8096"
	for _, input := range []string{"http://evil.example/Videos/" + item + "/stream.mp4", "/Videos/" + strings.Repeat("b", 32) + "/stream.mp4", "/System/Info", "http://user:pass@jellyfin:8096/Videos/" + item + "/stream.mp4", "/Videos/%61" + item[1:] + "/stream.mp4"} {
		if _, err := SafeMediaAsset(input, base, item); err == nil {
			t.Fatal("unsafe asset accepted", input)
		}
	}
	target, err := SafeMediaAsset("/Videos/"+item+"/master.m3u8?api_key=secret&ApiKey=secret&VideoCodec=hevc", base, item)
	if err != nil || strings.Contains(target.String(), "secret") {
		t.Fatal(target, err)
	}
	source := map[string]any{"Id": "source", "Container": "mkv", "SupportsDirectPlay": true, "SupportsTranscoding": true, "TranscodingUrl": "/Videos/" + item + "/master.m3u8"}
	selected, err := SelectSource(map[string]any{"MediaSources": []any{source}}, "source", item, base)
	if err != nil || selected.Method != "DirectPlay" || selected.Type != "mkv" || selected.URL.Query().Get("Static") != "true" {
		t.Fatal(selected, err)
	}
}
func TestSourceResolutionGradesAndSessionLifetime(t *testing.T) {
	for _, v := range []struct {
		height, width float64
		length        int
	}{{1608, 3840, 6}, {804, 1920, 5}, {720, 1280, 4}, {240, 320, 2}} {
		if len(Qualities(v.height, v.width)) != v.length {
			t.Fatal(v)
		}
	}
	now := time.Now()
	if SessionExpired(now.Add(-time.Hour), now.Add(-time.Hour), 1, now) {
		t.Fatal("active Range stream expired")
	}
	if !SessionExpired(now.Add(-time.Hour), now.Add(-time.Hour), 0, now) {
		t.Fatal("idle stream retained")
	}
	if !SessionExpired(now.Add(-12*time.Hour), now, 1, now) {
		t.Fatal("absolute lifetime exceeded")
	}
}
