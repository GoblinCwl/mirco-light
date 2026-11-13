package openlist

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"goblincwl/quartz-server/internal/friendavatar"
	"image"
	"image/png"
	"io"
	_ "modernc.org/sqlite"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestAvatarUploadAndReadPreserveOriginalAndReuseStoredPath(t *testing.T) {
	testAvatarUpload(t, false)
}
func TestCompressedAvatarUploadHashesStoredBytes(t *testing.T) {
	if _, err := exec.LookPath("magick"); err != nil {
		t.Skip("requires native image compressor")
	}
	testAvatarUpload(t, true)
}
func testAvatarUpload(t *testing.T, compress bool) {
	var pngData bytes.Buffer
	size := 3
	if compress {
		size = 512
	}
	png.Encode(&pngData, image.NewRGBA(image.Rect(0, 0, size, size)))
	original := append(pngData.Bytes(), []byte("APNG-data-preserved")...)
	var data []byte
	var savedPath string
	uploads := 0
	failUpload := false
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reply := func(code int, value any) { json.NewEncoder(w).Encode(map[string]any{"code": code, "data": value}) }
		if r.URL.Path == "/source.png" {
			w.Write(original)
			return
		}
		if r.URL.Path == "/raw" {
			w.Write(data)
			return
		}
		if r.URL.Path == "/api/auth/login" {
			reply(200, map[string]string{"token": "fixture"})
			return
		}
		if r.Header.Get("Authorization") != "fixture" {
			t.Error("missing storage authentication")
		}
		switch r.URL.Path {
		case "/api/me":
			reply(200, map[string]int{"role": 2})
		case "/api/fs/get":
			var input map[string]string
			json.NewDecoder(r.Body).Decode(&input)
			if input["path"] == savedPath && data != nil {
				reply(200, map[string]any{"raw_url": server.URL + "/raw", "is_dir": false})
			} else if input["path"] == "/Vault/MicroLight" || input["path"] == friendavatar.Directory {
				reply(200, map[string]any{"is_dir": true})
			} else {
				reply(404, nil)
			}
		case "/api/fs/put":
			if failUpload {
				reply(500, nil)
				return
			}
			var err error
			savedPath, err = url.PathUnescape(r.Header.Get("File-Path"))
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(savedPath, friendavatar.Directory+"/") || r.Header.Get("As-Task") != "false" {
				t.Error("unexpected upload destination or async upload")
			}
			data, _ = io.ReadAll(r.Body)
			uploads++
			reply(200, nil)
		default:
			t.Error("unexpected route", r.URL.Path)
			reply(500, nil)
		}
	}))
	defer server.Close()
	target := 256
	read := func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": server.URL, "openlist.username": "admin", "openlist.password": "secret", "friends.avatarTargetKiB": float64(target)}, nil
	}
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "avatar-cache.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec("CREATE TABLE friend_avatar_cache(cache_key TEXT PRIMARY KEY,filename TEXT)"); err != nil {
		t.Fatal(err)
	}
	calls := 0
	avatars := &Avatars{DB: db, compress: func(ctx context.Context, data []byte, target, memory int) ([]byte, string, string, error) {
		calls++
		return friendavatar.Compress(ctx, data, target, memory)
	}, Session: &Session{ReadSettings: read}, Settings: read, ImageClient: server.Client()}
	address, err := avatars.Save(context.Background(), server.URL+"/source.png")
	if err != nil || !friendavatar.Local(address) || (!compress && !bytes.Equal(data, original)) {
		t.Fatal("upload failed or transformed image", address, err)
	}
	expectedMime := "image/png"
	if compress {
		expectedMime = "image/webp"
		sum := sha256.Sum256(data)
		if bytes.Equal(data, original) || len(data) > 256*1024 || address != friendavatar.Prefix+hex.EncodeToString(sum[:])+".webp" {
			t.Fatal("upload did not use compressed content hash", address, len(data))
		}
	}
	stored := append([]byte{}, data...)
	result, mime, err := avatars.Read(context.Background(), strings.TrimPrefix(address, friendavatar.Prefix))
	if err != nil || mime != expectedMime || !bytes.Equal(result, stored) {
		t.Fatal("read failed or transformed image", mime, err)
	}
	if _, err = avatars.Save(context.Background(), address); err != nil || uploads != 1 {
		t.Fatal("stored avatar uploaded again", uploads, err)
	}
	// Recreate the service to verify the source digest cache survives restarts.
	clone := *avatars
	if got, err := clone.Save(context.Background(), server.URL+"/source.png"); err != nil || got != address || calls != 1 || uploads != 1 {
		t.Fatal("unchanged source recompressed", calls, uploads, err)
	}
	target = 512
	if _, err := avatars.Save(context.Background(), server.URL+"/source.png"); err != nil || calls != 2 {
		t.Fatal("settings change did not invalidate compression", calls, err)
	}
	data = nil
	failUpload = true
	if _, err = avatars.Save(context.Background(), server.URL+"/source.png"); err == nil {
		t.Fatal("upload failure ignored")
	}
	if calls != 3 {
		t.Fatal("missing stored file did not trigger recompression", calls)
	}
	failUpload = false
	original = append(original, byte(1))
	if _, err := avatars.Save(context.Background(), server.URL+"/source.png"); err != nil || calls != 4 {
		t.Fatal("source change reused old compression", calls, err)
	}
	if _, _, err = avatars.Read(context.Background(), "../secret"); err == nil {
		t.Fatal("path traversal accepted")
	}
}
