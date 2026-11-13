package video

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	_ "modernc.org/sqlite"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

func TestPublicVideoCommentsReadOnlyCacheAndReplyPages(t *testing.T) {
	ctx := context.Background()
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "video.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, query := range []string{`CREATE TABLE videos(bvid TEXT,title TEXT,cover TEXT,description TEXT,duration INTEGER,published_at TEXT,play INTEGER,danmaku INTEGER,comment_count INTEGER,fetched_at TEXT)`, `CREATE TABLE video_meta(key TEXT PRIMARY KEY,value TEXT)`, `INSERT INTO videos VALUES('BV1ua4W6XEJd','','','',1,'',0,0,1,'')`} {
		if _, err = db.Exec(query); err != nil {
			t.Fatal(err)
		}
	}
	detail, _ := json.Marshal(map[string]any{"stats": map[string]any{}, "updatedAt": stamp()})
	db.Exec("INSERT INTO video_meta VALUES(?,?)", "detail:BV1ua4W6XEJd", string(detail))
	calls := 0
	s := &Service{Store: Store{DB: db, MID: "123"}, Client: &Client{Cookie: func(context.Context) (string, error) {
		t.Fatal("public comments must not read owner cookie")
		return "", nil
	}, HTTP: &http.Client{Transport: transport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != "GET" || r.Header.Get("Cookie") != "" {
			t.Fatal("non-anonymous or mutating request")
		}
		body := `{"code":0,"data":{"bvid":"BV1ua4W6XEJd","aid":123,"owner":{"mid":123}}}`
		if r.URL.Path == "/x/v2/reply/main" || r.URL.Path == "/x/v2/reply/reply" {
			body = `{"code":0,"data":{"cursor":{"all_count":21,"next":2,"is_end":false},"page":{"count":21},"upper":{"top":{"rpid_str":"100","member":{"mid":"123","uname":"Owner"},"content":{"message":"pinned"}}},"replies":[{"rpid_str":"100","member":{"mid":"123","uname":"Owner"},"content":{"message":"duplicate"}},{"rpid_str":"101","member":{"mid":"2","uname":"Reader","avatar":"https://i0.hdslb.com/avatar.png"},"content":{"message":"<script>text</script> [smile]","emote":{"[smile]":{"url":"https://i0.hdslb.com/emote.png"},"bad":{"url":"javascript:alert(1)"}}}},{"rpid_str":"102","invisible":true},{"rpid_str":"103","state":1}]}}`
			if r.URL.Path == "/x/v2/reply/reply" && r.URL.Query().Get("root") != "100" {
				t.Fatal("wrong reply root")
			}
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}}}
	value, err := s.Comments(ctx, "BV1ua4W6XEJd", "", 1)
	if err != nil {
		t.Fatal(err)
	}
	items := value["items"].([]map[string]any)
	if len(items) != 2 || items[0]["pinned"] != true || items[0]["owner"] != true || value["pages"] != 2 {
		t.Fatal(value)
	}
	emotes := items[1]["emotes"].(map[string]string)
	if len(emotes) != 1 || items[1]["message"] != "<script>text</script> [smile]" {
		t.Fatal("unsafe emote or altered plain text")
	}
	if _, err = s.Comments(ctx, "BV1ua4W6XEJd", "", 1); err != nil || calls != 2 {
		t.Fatal("cache miss", calls, err)
	}
	if _, err = s.Comments(ctx, "BV1ua4W6XEJd", "100", 2); err != nil || calls != 3 {
		t.Fatal("reply pagination failed", calls, err)
	}
	if value, err = s.Comments(ctx, "BV1ua4W6XEJd", "", 2, "2"); err != nil || calls != 4 || value["hasMore"] != false {
		t.Fatal("cursor pagination failed", calls, err)
	}
	for _, root := range []string{"../admin", "0", "x"} {
		if _, err = s.Comments(ctx, "BV1ua4W6XEJd", root, 1); err == nil {
			t.Fatal("invalid root accepted")
		}
	}
	if _, err = s.Comments(ctx, "BV1ua4W6XEJd", "", 2); err == nil {
		t.Fatal("page without cursor accepted")
	}
	if _, err = s.Comments(ctx, "BV1ua4W6XEJd", "", 1001); err == nil {
		t.Fatal("unbounded pages")
	}
	if _, err = s.Comments(ctx, "BV1xx411c7mD", "", 1); err == nil {
		t.Fatal("unknown video accepted")
	}
}

func TestCommentImagesUpgradeTrustedCDNToHTTPS(t *testing.T) {
	for _, raw := range []string{"http://i1.hdslb.com/bfs/face/test.jpg", "https://i1.hdslb.com/bfs/face/test.jpg", "//i1.hdslb.com/bfs/face/test.jpg"} {
		if got := commentImage(raw); got != "https://i1.hdslb.com/bfs/face/test.jpg" {
			t.Fatal(raw, got)
		}
	}
	for _, raw := range []string{"http://example.com/a.jpg", "https://i1.hdslb.com.evil.test/a.jpg", "javascript:alert(1)", "https://user:password@i1.hdslb.com/a.jpg"} {
		if commentImage(raw) != "" {
			t.Fatal("accepted untrusted image", raw)
		}
	}
}
