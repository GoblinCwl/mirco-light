package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"goblincwl/quartz-server/internal/openlist"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixtureService(t *testing.T) *Service {
	t.Helper()
	item := strings.Repeat("a", 32)
	streams := []any{map[string]any{"Type": "Video", "Codec": "h264", "Width": 1920, "Height": 1080}, map[string]any{"Type": "Audio", "Index": float64(1), "IsDefault": true, "Codec": "aac"}, map[string]any{"Type": "Subtitle", "Index": float64(2), "Codec": "subrip", "IsTextSubtitleStream": true}, map[string]any{"Type": "Subtitle", "Index": float64(3), "Codec": "ass"}, map[string]any{"Type": "Subtitle", "Index": float64(4), "Codec": "pgssub"}}
	source := map[string]any{"Id": "source", "Container": "mp4", "SupportsDirectPlay": true, "RunTimeTicks": float64(1000000000), "MediaStreams": streams, "DefaultAudioStreamIndex": float64(1), "DefaultSubtitleStreamIndex": float64(2), "Bitrate": float64(8000000)}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		respond := func(value any) { w.Header().Set("Content-Type", "application/json"); json.NewEncoder(w).Encode(value) }
		switch {
		case r.URL.Path == "/api/fs/get":
			respond(map[string]any{"code": 200, "data": map[string]any{"name": "test.mkv", "is_dir": false}})
		case r.URL.Path == "/Users":
			respond([]any{map[string]any{"Id": "user", "Policy": map[string]any{"IsAdministrator": true}}})
		case r.URL.Path == "/Items/"+item+"/PlaybackInfo":
			if r.Method == "GET" && r.URL.Query().Get("UserId") != "user" {
				t.Error("lookup must use Jellyfin user preferences")
			}
			if r.Method == "POST" {
				var input map[string]any
				json.NewDecoder(r.Body).Decode(&input)
				if input["EnableDirectPlay"] == false {
					copy := map[string]any{}
					for k, v := range source {
						copy[k] = v
					}
					copy["SupportsDirectPlay"] = false
					copy["SupportsTranscoding"] = true
					copy["TranscodingUrl"] = "/Videos/" + item + "/master.m3u8?api_key=secret"
					copy["TranscodingContainer"] = "ts"
					copy["TranscodingSubProtocol"] = "hls"
					respond(map[string]any{"MediaSources": []any{copy}, "PlaySessionId": "play"})
					return
				}
			}
			respond(map[string]any{"MediaSources": []any{source}, "PlaySessionId": "play"})
		case strings.HasPrefix(r.URL.Path, "/MediaSegments/"):
			respond(map[string]any{"Items": []any{}})
		case strings.HasPrefix(r.URL.Path, "/Users/user/Items/"):
			respond(map[string]any{"Chapters": []any{}})
		case r.URL.Path == "/Videos/ActiveEncodings":
			w.WriteHeader(204)
		case strings.HasSuffix(r.URL.Path, "Stream.vtt"):
			io.WriteString(w, "WEBVTT\n\n00:10.000 --> 00:12.000\n{\\an8}字幕\n")
		case strings.HasSuffix(r.URL.Path, "Stream.ass"):
			io.WriteString(w, "[Events]\nFormat: Layer, Start, End, Text\nDialogue: 0,0:00:10.00,0:00:12.00,字幕\n")
		case strings.HasSuffix(r.URL.Path, "Stream.pgssub"):
			w.Header().Set("Content-Type", "application/octet-stream")
			if r.Method != "HEAD" {
				w.Write([]byte{'P', 'G', 0, 1})
			}
		case strings.HasSuffix(r.URL.Path, "master.m3u8"):
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			io.WriteString(w, "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000\nindex.m3u8\n")
		case strings.HasSuffix(r.URL.Path, "index.m3u8"):
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			io.WriteString(w, "#EXTM3U\n#EXTINF:4,\n0.ts\n#EXTINF:4,\n1.ts\n#EXT-X-ENDLIST\n")
		case strings.HasSuffix(r.URL.Path, ".ts") || strings.HasSuffix(r.URL.Path, "stream.mp4"):
			w.Header().Set("Content-Type", "video/mp4")
			w.Header().Set("Accept-Ranges", "bytes")
			if r.Header.Get("Range") == "bytes=1-3" {
				w.Header().Set("Content-Range", "bytes 1-3/6")
				w.WriteHeader(206)
				io.WriteString(w, "bcd")
			} else {
				io.WriteString(w, "abcdef")
			}
		default:
			t.Errorf("unexpected fixture request %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(server.Close)
	settings := func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": server.URL, "api.jellyfin.url": server.URL, "api.jellyfin.token": "private-token", "api.jellyfin.publicUrl": "https://media.test", "api.fontinass.url": server.URL}, nil
	}
	olDB, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "openlist.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { olDB.Close() })
	_, err = olDB.Exec(`CREATE TABLE x_storages(mount_path TEXT,driver TEXT,addition TEXT,disabled INTEGER);INSERT INTO x_storages VALUES('/media','Local','{"root_folder_path":"/srv"}',0);CREATE TABLE x_users(base_path TEXT,role INTEGER,disabled INTEGER);INSERT INTO x_users VALUES('/',1,0)`)
	if err != nil {
		t.Fatal(err)
	}
	library, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "jellyfin.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { library.Close() })
	_, err = library.Exec("CREATE TABLE BaseItems(Id TEXT,Path TEXT,Type TEXT,SeriesId TEXT,SeasonId TEXT);INSERT INTO BaseItems VALUES(?,?,'Movie',NULL,NULL)", item, "/srv/test.mkv")
	if err != nil {
		t.Fatal(err)
	}
	entries := &openlist.Adapter{DB: olDB}
	backend := &Backend{Library: library, OpenList: entries, Shares: &openlist.Shares{Settings: settings}, Settings: settings}
	service := NewService(context.Background(), backend, "https://blog.test")
	t.Cleanup(service.Close)
	return service
}
func TestResourceTicketsSubtitleFormatsAndRange(t *testing.T) {
	service := fixtureService(t)
	ctx := context.Background()
	lookup, err := service.Lookup(ctx, map[string]any{"path": "/media/test.mkv"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if lookup["defaultSubtitleStreamIndex"] != 2 {
		t.Fatal("Jellyfin default subtitle not propagated", lookup["defaultSubtitleStreamIndex"])
	}
	id := lookup["match"].(string)
	for _, pair := range [][2]string{{"2", "vtt"}, {"3", "ass"}, {"4", "sup"}} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest("GET", "http://bridge/subtitle", nil)
		if err = service.Subtitle(recorder, request, id, pair[0], pair[1]); err != nil {
			t.Fatal(pair, err)
		}
		if recorder.Body.Len() == 0 {
			t.Fatal("subtitle missing", pair)
		}
		if pair[1] == "vtt" && strings.Contains(recorder.Body.String(), `{\an8}`) {
			t.Fatal("raw ASS override leaked into VTT")
		}
	}
	var oracle []struct {
		Input PlaybackOptions `json:"input"`
	}
	raw, _ := os.ReadFile("testdata/playback.json")
	json.Unmarshal(raw, &oracle)
	result, err := service.Playback(ctx, map[string]any{"match": id, "quality": "original", "deviceProfile": oracle[0].Input.DeviceProfile, "subtitleStreamIndex": float64(-1)})
	if err != nil {
		t.Fatal(err)
	}
	if result["playMethod"] != "DirectPlay" || strings.Contains(result["url"].(string), "private-token") {
		t.Fatal(result)
	}
	ticket, _ := url.Parse(result["url"].(string))
	parts := strings.Split(ticket.Path, "/")
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest("GET", "http://bridge/stream", nil)
	request.Header.Set("Range", "bytes=1-3")
	if err = service.Stream(recorder, request, parts[len(parts)-2], parts[len(parts)-1]); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != 206 || recorder.Body.String() != "bcd" || recorder.Header().Get("Content-Range") != "bytes 1-3/6" {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
	service.Stop(result["session"].(string))
	recorder = httptest.NewRecorder()
	if err = service.Stream(recorder, request, parts[len(parts)-2], parts[len(parts)-1]); err != nil || recorder.Code != 404 {
		t.Fatal("stopped ticket retained", err, recorder.Code)
	}
}
func TestBurnedSubtitleHLSMasterRewritesAndPrepares(t *testing.T) {
	service := fixtureService(t)
	lookup, err := service.Lookup(context.Background(), map[string]any{"path": "/media/test.mkv"}, "")
	if err != nil {
		t.Fatal(err)
	}
	var oracle []struct {
		Input PlaybackOptions `json:"input"`
	}
	raw, _ := os.ReadFile("testdata/playback.json")
	json.Unmarshal(raw, &oracle)
	result, err := service.Playback(context.Background(), map[string]any{"match": lookup["match"], "quality": "original", "deviceProfile": oracle[0].Input.DeviceProfile, "subtitleStreamIndex": float64(4), "position": float64(5)})
	if err != nil {
		t.Fatal(err)
	}
	if result["playMethod"] != "Transcode" || result["subtitleStreamIndex"] != 4 {
		t.Fatal(result)
	}
	ticket, _ := url.Parse(result["url"].(string))
	parts := strings.Split(ticket.Path, "/")
	recorder := httptest.NewRecorder()
	if err = service.Stream(recorder, httptest.NewRequest("GET", "http://bridge/stream", nil), parts[len(parts)-2], parts[len(parts)-1]); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(recorder.Body.String(), "secret") || !strings.Contains(recorder.Body.String(), "https://media.test/api/public/quartz/jellyfin/stream/") {
		t.Fatal("manifest not safely rewritten", recorder.Body.String())
	}
}
