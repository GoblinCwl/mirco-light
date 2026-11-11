package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"goblincwl/quartz-server/internal/openlist"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func TestActualJellyfinAuthorizationLookupAndMetadata(t *testing.T) {
	library, olPath, jfOrigin, olOrigin := os.Getenv("TEST_JELLYFIN_DB"), os.Getenv("TEST_OPENLIST_DB"), os.Getenv("TEST_JELLYFIN_URL"), os.Getenv("TEST_OPENLIST_URL")
	if library == "" || olPath == "" || jfOrigin == "" || olOrigin == "" {
		t.Skip("native media fixtures not supplied")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	entries, err := openlist.Open(olPath)
	if err != nil {
		t.Fatal(err)
	}
	defer entries.DB.Close()
	read := func(context.Context) (map[string]any, error) {
		return map[string]any{"api.jellyfin.url": jfOrigin, "openlist.url": olOrigin, "api.fontinass.url": "http://127.0.0.1:8012", "api.jellyfin.publicUrl": "https://media.goblincwl.site"}, nil
	}
	backend, err := NewBackend(ctx, library, entries, &openlist.Shares{Settings: read}, read)
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Library.Close()
	service := NewService(ctx, backend, "https://goblincwl.site")
	defer service.Close()
	if user, err := backend.UserID(ctx); err != nil || user == "" {
		t.Fatal("native Jellyfin user resolution failed", err)
	}
	rows, err := entries.DB.QueryContext(ctx, "SELECT s.id,s.remark,s.files_raw,s.pwd,u.base_path FROM x_sharing_dbs s JOIN x_users u ON u.id=s.creator_id")
	if err != nil {
		t.Fatal(err)
	}
	type share struct {
		id, password, base string
		files              []string
	}
	shares := []share{}
	for rows.Next() {
		var id, remark, files, base string
		var password sql.NullString
		if err = rows.Scan(&id, &remark, &files, &password, &base); err != nil {
			t.Fatal(err)
		}
		meta, _ := openlist.ParseMetadata(remark, false)
		if meta.Jellyfin == nil || !*meta.Jellyfin {
			continue
		}
		var sources []string
		if json.Unmarshal([]byte(files), &sources) == nil {
			shares = append(shares, share{id, password.String, base, sources})
		}
	}
	rows.Close()
	if len(shares) == 0 {
		t.Fatal("no media share fixture")
	}
	verified := false
	for _, share := range shares {
		for _, source := range share.files {
			root, err := backend.PhysicalPath(ctx, share.base+"/"+strings.TrimPrefix(source, "/"))
			if err != nil {
				t.Fatal(err)
			}
			if root == "" {
				continue
			}
			var physical string
			err = backend.Library.QueryRowContext(ctx, "SELECT Path FROM BaseItems WHERE Type LIKE '%.Movie' AND (Path=? OR Path LIKE ?) ORDER BY Path LIMIT 1", root, strings.TrimRight(root, "/")+"/%").Scan(&physical)
			if err == sql.ErrNoRows {
				continue
			} else if err != nil {
				t.Fatal(err)
			}
			relative := strings.TrimPrefix(strings.TrimPrefix(physical, root), "/")
			prefix := ""
			if len(share.files) > 1 {
				parts := strings.Split(strings.TrimRight(source, "/"), "/")
				prefix = parts[len(parts)-1] + "/"
			}
			virtual := "/@s/" + share.id + "/" + prefix + relative
			input := map[string]any{"path": virtual, "password": share.password}
			lookup, err := service.Lookup(ctx, input, "")
			if err != nil || lookup["matched"] != true {
				t.Fatal("native authorized lookup failed", err)
			}
			if len(lookup["qualities"].([]Quality)) < 2 {
				t.Fatal("source quality missing")
			}
			value, err := service.MediaListing(ctx, input)
			if err != nil || object(value["current"])["type"] != "Movie" {
				t.Fatal("native movie metadata failed", err)
			}
			verified = true
			break
		}
		if verified {
			break
		}
	}
	if !verified {
		t.Fatal("no local movie under media share fixture")
	}
}

// This opt-in test starts short, scoped Jellyfin playback sessions and always
// stops their encoders. It uses real protected-share authorization, not a test
// user or newly imported media, and does not operate a browser.
func TestActualSubtitleDeliveryAndPGSResume(t *testing.T) {
	if os.Getenv("TEST_MEDIA_PLAYBACK") != "1" {
		t.Skip("native playback probe not enabled")
	}
	library, olPath, jfOrigin, olOrigin := os.Getenv("TEST_JELLYFIN_DB"), os.Getenv("TEST_OPENLIST_DB"), os.Getenv("TEST_JELLYFIN_URL"), os.Getenv("TEST_OPENLIST_URL")
	if library == "" || olPath == "" || jfOrigin == "" || olOrigin == "" {
		t.Fatal("native media fixtures required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Minute)
	defer cancel()
	entries, err := openlist.Open(olPath)
	if err != nil {
		t.Fatal(err)
	}
	defer entries.DB.Close()
	read := func(context.Context) (map[string]any, error) {
		return map[string]any{"api.jellyfin.url": jfOrigin, "openlist.url": olOrigin, "api.fontinass.url": "http://127.0.0.1:8012", "api.jellyfin.publicUrl": "https://media.goblincwl.site"}, nil
	}
	backend, err := NewBackend(ctx, library, entries, &openlist.Shares{Settings: read}, read)
	if err != nil {
		t.Fatal(err)
	}
	defer backend.Library.Close()
	service := NewService(ctx, backend, "https://goblincwl.site")
	defer service.Close()
	rows, err := entries.DB.QueryContext(ctx, "SELECT s.id,s.remark,s.files_raw,s.pwd,u.base_path FROM x_sharing_dbs s JOIN x_users u ON u.id=s.creator_id")
	if err != nil {
		t.Fatal(err)
	}
	type sourceRoot struct{ share, password, physical, prefix string }
	roots := []sourceRoot{}
	type sourceShare struct {
		id, password, base string
		files              []string
	}
	shares := []sourceShare{}
	for rows.Next() {
		var id, remark, files, base string
		var password sql.NullString
		if err = rows.Scan(&id, &remark, &files, &password, &base); err != nil {
			t.Fatal(err)
		}
		meta, _ := openlist.ParseMetadata(remark, false)
		if meta.Jellyfin == nil || !*meta.Jellyfin {
			continue
		}
		var paths []string
		if json.Unmarshal([]byte(files), &paths) == nil {
			shares = append(shares, sourceShare{id, password.String, base, paths})
		}
	}
	rows.Close()
	for _, share := range shares {
		for _, file := range share.files {
			physical, err := backend.PhysicalPath(ctx, share.base+"/"+strings.TrimPrefix(file, "/"))
			if err != nil {
				t.Fatal(err)
			}
			prefix := ""
			if len(share.files) > 1 {
				parts := strings.Split(strings.TrimRight(file, "/"), "/")
				prefix = parts[len(parts)-1] + "/"
			}
			if physical != "" {
				roots = append(roots, sourceRoot{share.id, share.password, physical, prefix})
			}
		}
	}
	raw, err := os.ReadFile("testdata/playback.json")
	if err != nil {
		t.Fatal(err)
	}
	var oracle []struct {
		Input PlaybackOptions `json:"input"`
	}
	json.Unmarshal(raw, &oracle)
	observed := map[string]bool{}
	for _, title := range []string{"宝可梦", "哈利", "教父"} {
		var physical string
		err = backend.Library.QueryRowContext(ctx, "SELECT Path FROM BaseItems WHERE Type LIKE '%.Movie' AND Path LIKE ? ORDER BY Path LIMIT 1", "%"+title+"%").Scan(&physical)
		if err == sql.ErrNoRows {
			continue
		} else if err != nil {
			t.Fatal(err)
		}
		virtual, password := "", ""
		for _, root := range roots {
			if Inside(physical, root.physical) {
				virtual = "/@s/" + root.share + "/" + root.prefix + strings.TrimPrefix(strings.TrimPrefix(physical, root.physical), "/")
				password = root.password
				break
			}
		}
		if virtual == "" {
			continue
		}
		lookup, err := service.Lookup(ctx, map[string]any{"path": virtual, "password": password}, "")
		if err != nil {
			t.Fatal("authorized native lookup failed", err)
		}
		matchID := text(lookup["match"])
		if matchID == "" {
			t.Fatal("native movie did not match")
		}
		testedPGS := false
		for _, track := range lookup["subtitles"].([]map[string]any) {
			kind := text(track["type"])
			if (observed[kind] && kind != "pgs") || (kind == "pgs" && testedPGS) || kind != "ass" && kind != "vtt" && kind != "pgs" {
				continue
			}
			if kind == "pgs" {
				for _, position := range []float64{0, 120} {
					playback, err := service.Playback(ctx, map[string]any{"match": matchID, "quality": "480", "deviceProfile": oracle[0].Input.DeviceProfile, "subtitleStreamIndex": track["index"], "position": position})
					if err != nil {
						t.Fatal("native PGS playback/resume failed", err)
					}
					func() {
						defer service.Stop(text(playback["session"]))
						if playback["playMethod"] != "Transcode" || playback["subtitleStreamIndex"] != int(number(track["index"])) {
							t.Error("PGS was not burned by Jellyfin")
						}
						ticket, _ := url.Parse(text(playback["url"]))
						parts := strings.Split(ticket.Path, "/")
						recorder := httptest.NewRecorder()
						if err := service.Stream(recorder, httptest.NewRequest("GET", "http://bridge/stream", nil).WithContext(ctx), parts[len(parts)-2], parts[len(parts)-1]); err != nil {
							t.Error("native HLS manifest failed", err)
						}
						if !strings.Contains(recorder.Body.String(), "#EXTM3U") {
							t.Error("native HLS manifest missing")
						}
					}()
				}
			} else {
				recorder := httptest.NewRecorder()
				request := httptest.NewRequest("GET", "http://bridge/subtitle", nil).WithContext(ctx)
				if err = service.Subtitle(recorder, request, matchID, numeric(number(track["index"])), kind); err != nil {
					t.Fatal("native subtitle delivery failed", kind, err)
				}
				if recorder.Body.Len() == 0 {
					t.Fatal("native subtitle empty", kind)
				}
				if kind == "vtt" && !strings.HasPrefix(recorder.Body.String(), "WEBVTT") {
					t.Fatal("native VTT missing header")
				}
				if kind == "ass" && !assEvents.MatchString(recorder.Body.String()) {
					t.Fatal("native ASS missing events")
				}
			}
			observed[kind] = true
			if kind == "pgs" {
				testedPGS = true
			}
		}
	}
	for _, kind := range []string{"vtt", "ass", "pgs"} {
		if !observed[kind] {
			t.Fatalf("native %s scenario not covered", kind)
		}
	}
}
