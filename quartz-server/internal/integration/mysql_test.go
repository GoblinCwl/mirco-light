package integration

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"database/sql"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-sql-driver/mysql"
	"goblincwl/quartz-server/internal/adapters"
	"goblincwl/quartz-server/internal/auth"
	"goblincwl/quartz-server/internal/comments"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/config"
	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/database"
	"goblincwl/quartz-server/internal/datamanager"
	"goblincwl/quartz-server/internal/httpapi"
	"goblincwl/quartz-server/internal/journal"
	"goblincwl/quartz-server/internal/monitoring"
	"goblincwl/quartz-server/internal/observer"
	"goblincwl/quartz-server/internal/openlist"
	"goblincwl/quartz-server/internal/repo"
	"goblincwl/quartz-server/internal/video"
	"goblincwl/quartz-server/internal/visitors"
	"golang.org/x/crypto/scrypt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func testDB(t *testing.T) *sql.DB {
	t.Helper()
	password := os.Getenv("TEST_MYSQL_PASSWORD")
	if password == "" {
		t.Skip("real MySQL test requires TEST_MYSQL_PASSWORD")
	}
	env := func(k string) string {
		switch k {
		case "MYSQL_PASSWORD":
			return password
		case "MYSQL_USER":
			return "root"
		case "MYSQL_ADDR":
			if value := os.Getenv("TEST_MYSQL_ADDR"); value != "" {
				return value
			}
			return "mysql:3306"
		}
		return ""
	}
	c, err := config.FromEnvironment(env)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	root, err := database.Open(ctx, c.DatabaseDSN)
	if err != nil {
		t.Fatal(err)
	}
	var random [12]byte
	if _, err = rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	name := "quartz_test_" + hex.EncodeToString(random[:])
	if _, err = root.ExecContext(ctx, "CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"); err != nil {
		t.Fatal(err)
	}
	dsn, err := mysql.ParseDSN(c.DatabaseDSN)
	if err != nil {
		t.Fatal(err)
	}
	dsn.DBName = name
	db, err := database.Open(ctx, dsn.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); root.ExecContext(context.Background(), "DROP DATABASE `"+name+"`"); root.Close() })
	raw, err := os.ReadFile("../../database/init.sql")
	if err != nil {
		t.Fatal(err)
	}
	// Each test uses a new empty database. This is initialization, not startup DDL.
	for _, statement := range strings.Split(string(raw), ";\n") {
		if strings.TrimSpace(statement) != "" {
			if _, err = db.ExecContext(ctx, statement); err != nil {
				t.Fatal(err)
			}
		}
	}
	return db
}
func TestCommunityTransactionsAndHTTP(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	friend := community.Friend{Name: "测试", URL: "https://example.com/", BacklinkURL: "https://example.com/friends", Avatar: "https://example.com/a.png", Description: "简介"}
	uploads := 0
	store.StoreAvatar = func(context.Context, string) (string, error) {
		uploads++
		return "", fmt.Errorf("request must not upload")
	}
	row, _, err := store.CreateFriend(ctx, friend, true)
	if err != nil {
		t.Fatal(err)
	}
	if row.Status != "待审核" || row.Avatar != friend.Avatar || row.RSSURL != "" {
		t.Fatal("application not pending")
	}
	if _, _, err = store.CreateFriend(ctx, friend, true); err == nil {
		t.Fatal("duplicate accepted")
	}
	if uploads != 0 {
		t.Fatal("submission performed remote work", uploads)
	}
	public, err := store.Friends(ctx, true)
	if err != nil || len(public) != 0 {
		t.Fatal("pending friend leaked")
	}
	if _, err = store.UpdateFriend(ctx, row.ID, community.Friend{Status: "展示中"}, "review", 0); err != nil {
		t.Fatal(err)
	}
	public, err = store.Friends(ctx, true)
	if err != nil || len(public) != 1 || public[0].BacklinkURL != friend.BacklinkURL {
		t.Fatal("review or backlink persistence failed")
	}
	updated := public[0]
	updated.BacklinkURL = "https://example.com/links"
	updated.RSSURL = "https://example.com/feed.xml"
	if _, err = store.UpdateFriend(ctx, row.ID, updated, "update", 0); err != nil {
		t.Fatal(err)
	}
	saved, err := store.Friends(ctx, false)
	if err != nil || len(saved) != 1 || saved[0].BacklinkURL != updated.BacklinkURL || saved[0].RSSURL != updated.RSSURL {
		t.Fatal("backlink update lost", saved, err)
	}
	// URLs above the former MySQL index length still obey the original 1500-char contract.
	friend.URL = "https://long.example/" + strings.Repeat("a", 1100)
	if _, _, err = store.CreateFriend(ctx, friend, false); err != nil {
		t.Fatal("long URL rejected:", err)
	}
	feedback, err := store.Submit(ctx, community.Feedback{Email: "test@example.com", Browser: "测试", Description: "问题"}, "test-agent")
	if err != nil {
		t.Fatal(err)
	}
	if err = store.UpdateFeedback(ctx, feedback.ID, "已解决", false); err != nil {
		t.Fatal(err)
	}
	if err = store.UpdateFeedback(ctx, feedback.ID, "已解决", false); err != nil {
		t.Fatal("idempotent update failed", err)
	}
	if err = store.UpdateFeedback(ctx, feedback.ID, "", true); err != nil {
		t.Fatal(err)
	}
	api := (&httpapi.Server{DB: db, Origin: "https://goblincwl.site", Log: slog.New(slog.NewTextHandler(io.Discard, nil))}).Handler()
	for _, test := range []struct {
		method, path, origin, body string
		status                     int
	}{{"GET", "/api/site/friends", "", "", 200}, {"GET", "/api/site/admin/data/friends", "", "", 401}, {"POST", "/api/site/friends/apply", "https://evil.example", "{}", 403}, {"POST", "/api/site/friends/apply", "https://goblincwl.site", "{} {}", 400}} {
		req := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
		if test.origin != "" {
			req.Header.Set("Origin", test.origin)
		}
		response := httptest.NewRecorder()
		api.ServeHTTP(response, req)
		if response.Code != test.status {
			t.Fatalf("%s: %d %s", test.path, response.Code, response.Body.String())
		}
	}
}
func TestAuthSetupRecoveryAndSessions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("01", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	password := "a-test-password"
	salt := "a-test-salt"
	derived, err := scrypt.Key([]byte(password), []byte(salt), 16384, 8, 1, 64)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"salt": salt, "hash": hex.EncodeToString(derived)})
	if _, err = db.Exec("INSERT INTO auth_state(`key`,value) VALUES('password',?)", string(raw)); err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1800000000, 0)
	service.Now = func() time.Time { return now }
	setup, err := service.Login(ctx, "192.0.2.1", auth.Input{Password: password})
	if err != nil || setup["setupRequired"] != true {
		t.Fatal("setup failed", err)
	}
	secret := setup["secret"].(string)
	confirmation, err := service.Confirm(ctx, "192.0.2.1", auth.Input{SetupToken: setup["setupToken"].(string), Code: currentCode(secret, now)})
	if err != nil {
		t.Fatal("TOTP confirmation failed", err)
	}
	if _, err = service.Finish(ctx, "192.0.2.1", auth.Input{CompletionToken: confirmation["completionToken"].(string), Saved: false}); err == nil {
		t.Fatal("finish without saved codes accepted")
	}
	completed, err := service.Finish(ctx, "192.0.2.1", auth.Input{CompletionToken: confirmation["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal("finish failed", err)
	}
	if !service.Authenticated(ctx, completed["token"].(string)) {
		t.Fatal("enrollment session invalid")
	}
	if _, err = service.Login(ctx, "192.0.2.1", auth.Input{Password: password, Code: currentCode(secret, now)}); err == nil {
		t.Fatal("consumed TOTP replay accepted")
	}
	now = now.Add(30 * time.Second)
	if _, err = service.Login(ctx, "192.0.2.1", auth.Input{Password: password, Code: currentCode(secret, now)}); err != nil {
		t.Fatal("next TOTP rejected", err)
	}
	code := confirmation["recoveryCodes"].([]string)[0]
	result, err := service.Login(ctx, "192.0.2.1", auth.Input{Password: password, RecoveryCode: code})
	if err != nil {
		t.Fatal(err)
	}
	token := result["token"].(string)
	if !service.Authenticated(ctx, token) {
		t.Fatal("new session rejected")
	}
	if _, err = service.Login(ctx, "192.0.2.1", auth.Input{Password: password, RecoveryCode: code}); err == nil {
		t.Fatal("recovery replay accepted")
	}
	service2, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	service2.Now = service.Now
	if !service2.Authenticated(ctx, token) {
		t.Fatal("session lost on process restart")
	}
	if err = service.Logout(ctx, token); err != nil {
		t.Fatal(err)
	}
	if service2.Authenticated(ctx, token) {
		t.Fatal("logout failed")
	}
	for range 8 {
		service.Login(ctx, "192.0.2.2", auth.Input{Password: "wrong"})
	}
	_, err = service.Login(ctx, "192.0.2.2", auth.Input{Password: password})
	var failure *auth.Error
	if !errors.As(err, &failure) || failure.Status != 429 {
		t.Fatal("rate limiting failed", err)
	}
}

func currentCode(secret string, now time.Time) string {
	key, _ := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(now.Unix()/30))
	mac := hmac.New(sha1.New, key)
	mac.Write(counter[:])
	hash := mac.Sum(nil)
	offset := hash[len(hash)-1] & 15
	return fmt.Sprintf("%06d", (binary.BigEndian.Uint32(hash[offset:offset+4])&0x7fffffff)%1000000)
}

func TestVisitorIdentityConcurrencyAndTimezone(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	now := time.Date(2026, 11, 9, 17, 0, 0, 0, time.UTC)
	region := "湖南省"
	raw := "中国|湖南省|长沙市|其他"
	store := visitors.Store{DB: db, Secret: []byte("01234567890123456789012345678901"), Now: func() time.Time { return now }, Locate: func(string) visitors.Location {
		return visitors.Location{Region: &region, Raw: &raw, Status: "resolved"}
	}}
	browser := "11111111-1111-4111-8111-111111111111"
	var wait sync.WaitGroup
	failures := make(chan error, 8)
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := store.Record(ctx, "::ffff:192.0.2.1", browser, "Mozilla/5.0 Chrome/100")
			if err != nil {
				failures <- err
			}
		}()
	}
	wait.Wait()
	close(failures)
	for err := range failures {
		t.Fatal("concurrent visitor record:", err)
	}
	summary, err := store.Summary(ctx, 30, store.Identity("192.0.2.1", browser))
	if err != nil || summary["total"] != 1 || summary["today"] != 1 {
		t.Fatal("visitor deduplication failed", summary, err)
	}
	var date string
	if err = db.QueryRow("SELECT day FROM daily_visitors").Scan(&date); err != nil || date != "2026-11-10" {
		t.Fatal("Shanghai day mismatch", date, err)
	}
	if _, err = store.Record(ctx, "192.0.2.2", browser, "Mozilla/5.0 Firefox/100"); err != nil {
		t.Fatal(err)
	}
	records, err := store.Records(ctx, 1, "湖南", "2026-11-10", "")
	if err != nil || records["total"] != 1 {
		t.Fatal("records filter failed", err)
	}
	timeline, err := store.Timeline(ctx)
	if err != nil || timeline["dimension"] != "day" || timeline["total"] != 1 {
		t.Fatal("timeline failed", err)
	}
	now = now.AddDate(0, 2, 0)
	if _, err = store.Record(ctx, "192.0.2.2", browser, "Firefox/100"); err != nil {
		t.Fatal(err)
	}
	timeline, err = store.Timeline(ctx)
	if err != nil || timeline["dimension"] != "month" || timeline["total"] != 1 || len(timeline["points"].([]map[string]any)) != 3 {
		t.Fatal("monthly distinct count failed", timeline, err)
	}
}
func TestRealIPDatabases(t *testing.T) {
	directory := os.Getenv("TEST_GEOIP")
	if directory == "" {
		t.Skip("actual xdb directory not supplied")
	}
	db := testDB(t)
	if err := visitors.ImportGeo(context.Background(), db, directory); err != nil {
		t.Fatal(err)
	}
	geo, err := visitors.NewGeo(context.Background(), db)
	if err != nil {
		t.Fatal(err)
	}
	defer geo.Close()
	for _, ip := range []string{"8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"} {
		location := geo.Lookup(ip)
		if location.Status != "resolved" || location.Region == nil {
			t.Fatalf("lookup failed for fixture %s: %s", ip, location.Status)
		}
	}
}
func TestReadOnlyOpenList(t *testing.T) {
	path := os.Getenv("TEST_OPENLIST_DB")
	if path == "" {
		t.Skip("OpenList snapshot not supplied")
	}
	adapter, err := openlist.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer adapter.DB.Close()
	entries, err := adapter.Entries(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) == 0 {
		t.Fatal("live entries unexpectedly empty")
	}
	if _, err = adapter.DB.Exec("CREATE TABLE quartz_forbidden(id INTEGER)"); err == nil {
		t.Fatal("third party database writable")
	}
	items, err := adapter.Content(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	shares := 0
	for _, entry := range entries {
		if entry.Kind == "share" {
			shares++
		}
	}
	if len(items) != shares {
		t.Fatal("non-share indexed or share lost")
	}
	data, err := json.Marshal(entries)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"files_raw", "base_path", "creator_id", "pwd"} {
		if strings.Contains(string(data), `"`+field+`"`) {
			t.Fatal("private source field exposed")
		}
	}
}

func TestDataManagerCRUDAndBoundaries(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	manager := datamanager.Manager{DB: db}
	catalog, err := manager.Catalog(ctx)
	if err != nil || len(catalog) != 16 {
		t.Fatal("data catalog failed", err)
	}
	for _, id := range []string{"auth_state", "auth_sessions", "settings", "schema_migrations", "friends; DROP TABLE friends"} {
		if _, err = manager.List(ctx, id, 1, ""); err == nil {
			t.Fatalf("private or invalid table exposed: %s", id)
		}
	}
	friend, err := manager.Save(ctx, "friends", map[string]any{"name": "站点", "url": "https://example.com", "avatar": "", "description": ""}, nil)
	if err != nil {
		t.Fatal("create friend", err)
	}
	key := friend["key"].(map[string]any)
	record, err := manager.Read(ctx, "friends", key)
	if err != nil || record["status"] != "待审核" {
		t.Fatal("default pending status failed", err)
	}
	if _, err = manager.Save(ctx, "friends", map[string]any{"name": "changed"}, key); err != nil {
		t.Fatal("update friend", err)
	}
	if _, err = manager.Save(ctx, "friends", map[string]any{"id": "changed"}, key); err == nil {
		t.Fatal("primary key mutated")
	}
	if err = manager.Remove(ctx, "friends", key); err != nil {
		t.Fatal(err)
	}
	person, err := manager.Save(ctx, "visitors", map[string]any{"region": "湖南省", "browser": "Firefox"}, nil)
	if err != nil {
		t.Fatal("create visitor", err)
	}
	personKey := person["key"].(map[string]any)
	var days int
	if err = db.QueryRow("SELECT count(*) FROM daily_visitors WHERE identity=?", personKey["identity"]).Scan(&days); err != nil || days != 1 {
		t.Fatal("daily record not created", err)
	}
	if err = manager.Remove(ctx, "visitors", personKey); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow("SELECT count(*) FROM daily_visitors").Scan(&days); err != nil || days != 0 {
		t.Fatal("visitor cascade failed", err)
	}
	encrypted, err := manager.Save(ctx, "content-index", map[string]any{"type": "article", "source_id": "private", "slug": "private", "href": "/private/", "title": "private", "content": "hidden body", "description": "hidden description", "encrypted": float64(1)}, nil)
	if err != nil {
		t.Fatal("private index", err)
	}
	record, err = manager.Read(ctx, "content-index", encrypted["key"].(map[string]any))
	if err != nil || record["content"] != "" || record["description"] != "" || strings.Contains(fmt.Sprint(record["search_text"]), "hidden") {
		t.Fatal("encrypted data leaked", err)
	}
	for i := range 12 {
		if _, err = manager.Save(ctx, "journal", map[string]any{"kind": "site", "payload": fmt.Sprintf("{\"count\":%d}", i)}, nil); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM journal").Scan(&count); err != nil || count != 10 {
		t.Fatal("generic journal retention failed", err)
	}
}

func TestActualGiteaReadOnlyRepositories(t *testing.T) {
	root, catalog, origin := os.Getenv("TEST_REPO_ROOT"), os.Getenv("TEST_REPO_CATALOG"), os.Getenv("TEST_GITEA_URL")
	if root == "" || catalog == "" || origin == "" {
		t.Skip("actual Gitea fixture not supplied")
	}
	adapter := &repo.Adapter{Owner: "GoblinCwl", Root: root, CatalogFile: catalog, Origin: func(context.Context) (string, error) { return origin, nil }}
	ctx := context.Background()
	value, err := adapter.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	repositories := value["repositories"].([]map[string]any)
	if len(repositories) == 0 {
		t.Fatal("no public mirrors found")
	}
	if _, _, err = adapter.Repository(ctx, "../private"); err == nil {
		t.Fatal("unsafe repository accepted")
	}
	count := len(repositories)
	if count > 3 {
		count = 3
	}
	for _, row := range repositories[:count] {
		name := row["name"].(string)
		for _, action := range []string{"info", "browse", "readme", "files", "commits", "diff"} {
			value, err := adapter.Dispatch(ctx, name, action, url.Values{})
			if err != nil {
				t.Fatalf("%s/%s failed: %v", name, action, err)
			}
			if value == nil {
				t.Fatal("empty repository response")
			}
		}
		if _, err = adapter.Dispatch(ctx, name, "search", url.Values{"q": []string{"README"}}); err != nil {
			t.Fatal("search failed", err)
		}
	}
	items, err := adapter.Content(ctx)
	if err != nil || len(items) != len(repositories) {
		t.Fatal("repository index source incomplete", err)
	}
}

func TestIndexShareRenameKeepsIdentity(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db, Origin: "https://goblincwl.site"}
	old := []content.Item{{SourceID: "before", Slug: "Share/分享/before", Title: "before", PublishedAt: "2026-11-10T00:00:00Z", Tags: []string{"test"}}}
	if err := store.Sync(ctx, "share", old); err != nil {
		t.Fatal(err)
	}
	catalog, err := store.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	id := catalog["pages"].(map[string]content.Page)["Share/分享/before"].ID
	if _, err = store.EditTags(ctx, id, []string{"custom"}, false); err != nil {
		t.Fatal(err)
	}
	if err = store.RenameShare(ctx, "before", "after"); err != nil {
		t.Fatal(err)
	}
	old[0].SourceID = "after"
	old[0].Slug = "Share/分享/after"
	old[0].Title = "after"
	if err = store.Sync(ctx, "share", old); err != nil {
		t.Fatal(err)
	}
	catalog, err = store.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	page := catalog["pages"].(map[string]content.Page)["Share/分享/after"]
	if page.ID != id || len(page.Tags) != 1 || page.Tags[0] != "custom" {
		t.Fatal("share rename lost stable identity or custom tags")
	}
	feed, err := store.RSS(ctx)
	if err != nil || !strings.Contains(feed, "urn:weiguanji:"+id) {
		t.Fatal("RSS identity changed", err)
	}
}

func TestOpenListAdministratorSession(t *testing.T) {
	directory := os.Getenv("TEST_PROVIDER_SNAPSHOT")
	origin := os.Getenv("TEST_OPENLIST_URL")
	if directory == "" || origin == "" {
		t.Skip("configured OpenList session fixture not supplied")
	}
	raw, err := os.ReadFile(filepath.Join(directory, "private/runtime/portal/settings.json"))
	if err != nil {
		t.Fatal(err)
	}
	var settings map[string]any
	if err = json.Unmarshal(raw, &settings); err != nil {
		t.Fatal(err)
	}
	username, _ := settings["openlist.username"].(string)
	password, _ := settings["openlist.password"].(string)
	if username == "" || password == "" {
		t.Skip("OpenList administrator not configured")
	}
	settings["openlist.url"] = origin
	session := openlist.Session{ReadSettings: func(context.Context) (map[string]any, error) { return settings, nil }}
	value, err := session.Get(context.Background())
	if err != nil {
		t.Fatal("configured OpenList login failed")
	}
	if value["configured"] != true || value["token"] == "" {
		t.Fatal("administrator session not returned")
	}
}

func TestActualActivityWatchSummary(t *testing.T) {
	origin := os.Getenv("TEST_AW_URL")
	if origin == "" {
		t.Skip("ActivityWatch fixture not supplied")
	}
	db := testDB(t)
	manager := adapters.Manager{DB: db, Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.activitywatch.url": origin, "api.activitywatch.categorySet": "cwl"}, nil
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := manager.RefreshSummary(ctx); err != nil {
		t.Fatal("ActivityWatch aggregate failed", err)
	}
	value, err := manager.Summary(ctx)
	if err != nil || value["timezone"] != "Asia/Shanghai" || value["categories"] == nil {
		t.Fatal("ActivityWatch public response invalid", err)
	}
}

func TestActualBeszelRealtime(t *testing.T) {
	path, origin := os.Getenv("TEST_BESZEL_DB"), os.Getenv("TEST_BESZEL_URL")
	if path == "" || origin == "" {
		t.Skip("Beszel fixture not supplied")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	manager, err := monitoring.Open(ctx, path, func(context.Context) (map[string]any, error) { return map[string]any{"api.beszel.url": origin}, nil })
	if err != nil {
		t.Fatal(err)
	}
	defer manager.Close()
	for {
		value, err := manager.Monitoring(ctx)
		if err != nil {
			t.Fatal(err)
		}
		systems := value["systems"].([]map[string]any)
		if len(systems) != 1 {
			t.Fatal("host missing")
		}
		if len(systems[0]["history"].([]monitoring.Point)) > 0 {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatal("Beszel realtime produced no data")
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func TestActualArtalkReadOnlyAuthentication(t *testing.T) {
	origin := os.Getenv("TEST_ARTALK_URL")
	directory := os.Getenv("TEST_PROVIDER_SNAPSHOT")
	if origin == "" || directory == "" {
		t.Skip("Artalk fixture not supplied")
	}
	raw, err := os.ReadFile(filepath.Join(directory, "private/external/artalk-comments-admin.json"))
	if err != nil {
		t.Fatal(err)
	}
	var credentials map[string]any
	if err = json.Unmarshal(raw, &credentials); err != nil {
		t.Fatal(err)
	}
	client := comments.Client{Settings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.artalk.url": origin, "api.artalk.email": credentials["email"], "api.artalk.password": credentials["password"]}, nil
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	value, err := client.Do(ctx, "/api/v2/pages?limit=1", true, "GET", nil)
	if err != nil {
		t.Fatal("Artalk authenticated read failed", err)
	}
	if _, ok := value["pages"].([]any); !ok {
		t.Fatal("unexpected Artalk response")
	}
}

func TestBuildJournalSnapshotDeduplication(t *testing.T) {
	db := testDB(t)
	store := journal.Store{DB: db}
	ctx := context.Background()
	state := func(hash, date string) []byte {
		raw, _ := json.Marshal(map[string]any{"sources": map[string]any{"quartz/file.ts": map[string]any{"hash": strings.Repeat(hash, 64)}}, "completedAt": date})
		return raw
	}
	first := state("a", "2026-11-10T01:00:00.000Z")
	second := state("b", "2026-11-10T02:00:00.000Z")
	for _, raw := range [][]byte{first, second, second, first} {
		if err := store.ImportBuild(ctx, raw); err != nil {
			t.Fatal(err)
		}
	}
	events, err := store.Read(ctx)
	if err != nil || len(events) != 1 || events[0].Kind != "site" || events[0].Payload["count"] != float64(1) {
		t.Fatal("duplicate/missing build event", events, err)
	}
	if err = store.ImportBuild(ctx, []byte(`{"sources":{}}`)); err == nil {
		t.Fatal("incomplete snapshot accepted")
	}
}

func TestServiceCheckpointSurvivesJournalPruning(t *testing.T) {
	db := testDB(t)
	store := journal.Store{DB: db}
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "observer.json")
	snapshot := observer.Snapshot{States: map[string]observer.State{}, Events: []observer.Event{{ID: "service:fixture:start", CompletedAt: "2026-11-10T00:00:00.000Z", Service: "OpenList", Operation: "restart"}}}
	if err := observer.Save(path, snapshot); err != nil {
		t.Fatal(err)
	}
	if err := store.ServiceFile(ctx, path); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10; i++ {
		if err := store.Append(ctx, "site", map[string]any{"count": i + 1}, "", fmt.Sprintf("after-service:%d", i)); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.ServiceFile(ctx, path); err != nil {
		t.Fatal(err)
	}
	events, err := store.Read(ctx)
	if err != nil || len(events) != 10 {
		t.Fatal(events, err)
	}
	for _, event := range events {
		if event.Kind == "service" {
			t.Fatal("trimmed event replayed from unchanged observer snapshot")
		}
	}
}

func TestStagingAdminReadContracts(t *testing.T) {
	target := os.Getenv("TEST_STAGING_URL")
	if target == "" {
		t.Skip("isolated staging service not supplied")
	}
	cfg, err := config.FromEnvironment(func(key string) string {
		switch key {
		case "MYSQL_ADDR":
			return os.Getenv("TEST_MYSQL_ADDR")
		case "MYSQL_PASSWORD":
			return os.Getenv("TEST_MYSQL_PASSWORD")
		case "MYSQL_USER":
			return "root"
		case "MYSQL_DATABASE":
			return "quartz_staging"
		}
		return ""
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, cfg.DatabaseDSN)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var passwordRaw, factorRaw string
	if err = db.QueryRowContext(ctx, "SELECT value FROM auth_state WHERE `key`='password'").Scan(&passwordRaw); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, "SELECT value FROM auth_state WHERE `key`='totp'").Scan(&factorRaw); err != nil {
		t.Fatal(err)
	}
	var password auth.Password
	var factor auth.Factor
	if err = json.Unmarshal([]byte(passwordRaw), &password); err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal([]byte(factorRaw), &factor); err != nil {
		t.Fatal(err)
	}
	var bytes [32]byte
	if _, err = rand.Read(bytes[:]); err != nil {
		t.Fatal(err)
	}
	token := hex.EncodeToString(bytes[:])
	hashed := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hashed[:])
	version := sha256.Sum256([]byte(password.Hash + ":" + password.FactorEpoch + ":" + factor.Generation))
	if _, err = db.ExecContext(ctx, "INSERT INTO auth_sessions(token_hash,version,expires_at) VALUES(?,?,?)", tokenHash, hex.EncodeToString(version[:]), time.Now().Add(5*time.Minute).UnixMilli()); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(context.Background(), "DELETE FROM auth_sessions WHERE token_hash=?", tokenHash)
	client := &http.Client{Timeout: 45 * time.Second}
	for _, path := range []string{"/api/site/session", "/api/site/admin/settings", "/api/site/admin/upstreams", "/api/site/admin/data/tables", "/api/site/admin/data/friends", "/api/site/admin/data/feedback", "/api/site/admin/build"} {
		request, _ := http.NewRequestWithContext(ctx, "GET", target+path, nil)
		request.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: token})
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(path, err)
		}
		if response.StatusCode != 200 {
			response.Body.Close()
			t.Fatalf("staging %s returned %d", path, response.StatusCode)
		}
		var value map[string]any
		err = json.NewDecoder(response.Body).Decode(&value)
		response.Body.Close()
		if err != nil {
			t.Fatal(path, err)
		}
		if path == "/api/site/session" && value["authenticated"] != true {
			t.Fatal("scoped staging session not accepted")
		}
	}
}

func TestLocalMaintenanceInvalidatesSessionsAndKeepsFactor(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("02", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1800000000, 0)
	service.Now = func() time.Time { return now }
	if err = service.SetPassword(ctx, "first-password-for-test"); err != nil {
		t.Fatal(err)
	}
	setup, err := service.Login(ctx, "192.0.2.10", auth.Input{Password: "first-password-for-test"})
	if err != nil {
		t.Fatal(err)
	}
	confirmation, err := service.Confirm(ctx, "192.0.2.10", auth.Input{SetupToken: setup["setupToken"].(string), Code: currentCode(setup["secret"].(string), now)})
	if err != nil {
		t.Fatal(err)
	}
	completed, err := service.Finish(ctx, "192.0.2.10", auth.Input{CompletionToken: confirmation["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal(err)
	}
	token := completed["token"].(string)
	if err = service.SetPassword(ctx, "second-password-for-test"); err != nil {
		t.Fatal(err)
	}
	if service.Authenticated(ctx, token) {
		t.Fatal("password change retained old session")
	}
	status, err := service.Status(ctx)
	if err != nil || status["totpEnabled"] != true {
		t.Fatal("password maintenance removed bound factor", err)
	}
	if err = service.ResetTOTP(ctx); err != nil {
		t.Fatal(err)
	}
	status, err = service.Status(ctx)
	if err != nil || status["totpEnabled"] != false {
		t.Fatal("factor reset failed", err)
	}
	setup, err = service.Login(ctx, "192.0.2.11", auth.Input{Password: "second-password-for-test"})
	if err != nil || setup["setupRequired"] != true {
		t.Fatal("factor re-enrollment unavailable", err)
	}
}

func TestStructuredDataAndVisitorForeignKeys(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	// Invalid structured data and non-boolean flags cannot bypass application validation.
	if _, err := db.ExecContext(ctx, "INSERT INTO settings(`key`,value) VALUES('invalid','not json')"); err == nil {
		t.Fatal("invalid JSON accepted")
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO daily_visitors(day,identity) VALUES('2026-11-10',?)", strings.Repeat("a", 64)); err == nil {
		t.Fatal("orphan daily visitor accepted")
	}
	identity := strings.Repeat("b", 64)
	if _, err := db.ExecContext(ctx, "INSERT INTO visitors(identity,meteor_id,first_seen,last_seen) VALUES(?,?,'2026-11-10T00:00:00.000Z','2026-11-10T00:00:00.000Z')", identity, strings.Repeat("c", 24)); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO daily_visitors(day,identity) VALUES('2026-11-10',?)", identity); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO visitor_fixtures(identity,batch) VALUES(?,'check')", identity); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "DELETE FROM visitors WHERE identity=?", identity); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"daily_visitors", "visitor_fixtures"} {
		var n int
		if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&n); err != nil || n != 0 {
			t.Fatal("visitor cascade failed", table, err)
		}
	}
	if _, err := db.ExecContext(ctx, "INSERT INTO content(id,type,source_id,slug,href,title,content,description,tags,links,encrypted,revision,event_revision,search_text,extra) VALUES('invalid','article','i','i','/i','i','','','[]','[]',2,'','','','{}')"); err == nil {
		t.Fatal("non-boolean encrypted value accepted")
	}
}

func TestVisitRecordingDoesNotReadStatistics(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	var name string
	if err := db.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&name); err != nil {
		t.Fatal(err)
	}
	var random [12]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	user := "q_visit_" + hex.EncodeToString(random[:8])
	password := hex.EncodeToString(random[:])
	if _, err := db.ExecContext(ctx, "CREATE USER '"+user+"'@'%' IDENTIFIED BY '"+password+"'"); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(context.Background(), "DROP USER '"+user+"'@'%'")
	// The recorder may read/update its identity and insert a daily record. It has
	// no SELECT privilege on daily_visitors, so an accidental Summary call fails.
	for _, grant := range []string{"SELECT,INSERT,UPDATE ON `" + name + "`.visitors", "INSERT ON `" + name + "`.daily_visitors"} {
		if _, err := db.ExecContext(ctx, "GRANT "+grant+" TO '"+user+"'@'%'"); err != nil {
			t.Fatal(err)
		}
	}
	cfg := mysql.NewConfig()
	cfg.Net = "tcp"
	cfg.Addr = os.Getenv("TEST_MYSQL_ADDR")
	if cfg.Addr == "" {
		cfg.Addr = "mysql:3306"
	}
	cfg.User = user
	cfg.Passwd = password
	cfg.DBName = name
	cfg.ParseTime = true
	cfg.Params = map[string]string{"charset": "utf8mb4"}
	restricted, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	defer restricted.Close()
	store := &visitors.Store{DB: restricted, Secret: []byte("01234567890123456789012345678901")}
	server := &httpapi.Server{DB: restricted, Origin: "https://goblincwl.site", Visitors: store, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	handler := server.Handler()
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest("POST", "/api/visitors/visit", nil)
		req.Header.Set("Origin", server.Origin)
		req.Header.Set("X-Real-IP", "192.0.2.81")
		req.Header.Set("X-Visitor-ID", "11111111-1111-4111-8111-111111111111")
		req.Header.Set("User-Agent", "Mozilla/5.0 Firefox/140")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != 200 {
			t.Fatalf("record endpoint unexpectedly needed read privileges: %d", response.Code)
		}
		var value map[string]any
		if err = json.Unmarshal(response.Body.Bytes(), &value); err != nil {
			t.Fatal(err)
		}
		if len(value) != 2 || value["meteorId"] == nil || value["isNew"] != (i == 0) {
			t.Fatal("record endpoint returned statistics or an invalid identity")
		}
	}
	if _, err = store.Summary(ctx, 30, ""); err == nil {
		t.Fatal("test user unexpectedly has summary read access")
	}
	server.Visitors = &visitors.Store{DB: db, Secret: store.Secret}
	handler = server.Handler()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/api/visitors/records?page=1", nil))
	var value map[string]any
	if err = json.Unmarshal(response.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || value["records"] == nil || value["meteors"] != nil {
		t.Fatal("historical query is not isolated from summary")
	}
}

func TestArticleCatalogPreservesOriginalFilePath(t *testing.T) {
	db := testDB(t)
	store := content.Store{DB: db, Origin: "https://goblincwl.site"}
	ctx := context.Background()
	if err := store.Sync(ctx, "article", []content.Item{{SourceID: "Study/HTTP-Client/note", Slug: "Study/HTTP-Client/note", Title: "笔记", Extra: map[string]any{"filePath": "Study/HTTP Client/note.md"}}}); err != nil {
		t.Fatal(err)
	}
	catalog, err := store.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	page := catalog["pages"].(map[string]content.Page)["Study/HTTP-Client/note"]
	if page.FilePath != "Study/HTTP Client/note.md" || page.Slug != "Study/HTTP-Client/note" {
		t.Fatal("source folder name or canonical route changed")
	}
}

func TestCatalogDoesNotReadArticleBodyOrSearchText(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db, Origin: "https://goblincwl.site"}
	if err := store.Sync(ctx, "article", []content.Item{{SourceID: "Memo/a", Slug: "Memo/a", Title: "文章", Content: strings.Repeat("正文", 10000)}}); err != nil {
		t.Fatal(err)
	}
	var name string
	if err := db.QueryRowContext(ctx, "SELECT DATABASE()").Scan(&name); err != nil {
		t.Fatal(err)
	}
	var random [12]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	user := "q_index_" + hex.EncodeToString(random[:8])
	password := hex.EncodeToString(random[:])
	if _, err := db.ExecContext(ctx, "CREATE USER '"+user+"'@'%' IDENTIFIED BY '"+password+"'"); err != nil {
		t.Fatal(err)
	}
	defer db.ExecContext(context.Background(), "DROP USER '"+user+"'@'%'")
	columns := "id,type,source_id,slug,href,title,description,tags,links,published_at,updated_at,encrypted,revision,event_revision,extra"
	if _, err := db.ExecContext(ctx, "GRANT SELECT ("+columns+") ON `"+name+"`.content TO '"+user+"'@'%'"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, "GRANT SELECT ON `"+name+"`.content_meta TO '"+user+"'@'%'"); err != nil {
		t.Fatal(err)
	}
	cfg := mysql.NewConfig()
	cfg.Net = "tcp"
	cfg.Addr = os.Getenv("TEST_MYSQL_ADDR")
	if cfg.Addr == "" {
		cfg.Addr = "mysql:3306"
	}
	cfg.User = user
	cfg.Passwd = password
	cfg.DBName = name
	cfg.Params = map[string]string{"charset": "utf8mb4"}
	restricted, err := sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		t.Fatal(err)
	}
	defer restricted.Close()
	readonly := content.Store{DB: restricted, Origin: store.Origin}
	if _, err = readonly.Catalog(ctx); err != nil {
		t.Fatal("catalog unnecessarily read article bodies", err)
	}
	if _, err = readonly.Recent(ctx); err != nil {
		t.Fatal("recent unnecessarily read article bodies", err)
	}
	if _, err = readonly.RSS(ctx); err != nil {
		t.Fatal("RSS unnecessarily read article bodies", err)
	}
	if _, err = readonly.Search(ctx, "正文"); err == nil {
		t.Fatal("test user unexpectedly can read search text")
	}
}

func TestNonArticleIndexOwnsFinalTagsAcrossSourceRefresh(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := content.Store{DB: db}
	for _, kind := range []string{"repo", "video", "share"} {
		item := content.Item{SourceID: kind, Slug: kind + "/entry", Title: kind, Tags: []string{"source"}}
		if err := store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		catalog, err := store.Catalog(ctx)
		if err != nil {
			t.Fatal(err)
		}
		page := catalog["pages"].(map[string]content.Page)[item.Slug]
		if _, err = store.EditTags(ctx, page.ID, []string{"custom"}, false); err != nil {
			t.Fatal(err)
		}
		item.Tags = []string{"changed-source"}
		if err = store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		state, err := store.Tags(ctx, page.ID)
		if err != nil || fmt.Sprint(state["tags"]) != "[custom]" {
			t.Fatal("manual labels overwritten", state, err)
		}
		if _, err = store.EditTags(ctx, page.ID, []string{}, false); err != nil {
			t.Fatal(err)
		}
		if err = store.Sync(ctx, kind, []content.Item{item}); err != nil {
			t.Fatal(err)
		}
		state, err = store.Tags(ctx, page.ID)
		if err != nil || len(state["tags"].([]string)) != 0 {
			t.Fatal("explicit empty labels lost", state, err)
		}
		if _, err = store.EditTags(ctx, page.ID, nil, true); err != nil {
			t.Fatal(err)
		}
		state, err = store.Tags(ctx, page.ID)
		if err != nil || fmt.Sprint(state["tags"]) != "[changed-source]" {
			t.Fatal("source reset failed", state, err)
		}
	}
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('content_tags','schema_migrations','migration_imports','portal_migrations')").Scan(&n); err != nil || n != 0 {
		t.Fatal("obsolete tables initialized", n, err)
	}
}

func TestUnifiedSiteAndShareIdentity(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("03", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = service.SetPassword(ctx, "identity-password-for-test"); err != nil {
		t.Fatal(err)
	}
	setup, err := service.Login(ctx, "192.0.2.1", auth.Input{Password: "identity-password-for-test"})
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := service.Confirm(ctx, "192.0.2.1", auth.Input{SetupToken: setup["setupToken"].(string), Code: currentCode(setup["secret"].(string), time.Now())})
	if err != nil {
		t.Fatal(err)
	}
	logged, err := service.Finish(ctx, "192.0.2.1", auth.Input{CompletionToken: confirmed["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal(err)
	}
	var calls int
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path == "/api/auth/login" {
			json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": map[string]any{"token": "private-token"}})
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"code": 200, "data": map[string]any{"role": 2, "username": "admin", "base_path": "/Vault", "password": "must-not-leak"}})
	}))
	defer upstream.Close()
	shares := &openlist.Session{ReadSettings: func(context.Context) (map[string]any, error) {
		return map[string]any{"openlist.url": upstream.URL, "openlist.username": "admin", "openlist.password": "secret"}, nil
	}}
	server := &httpapi.Server{DB: db, Auth: service, ShareSession: shares, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Origin: "https://site.test"}
	handler := server.Handler()
	read := func(token string, share bool) map[string]any {
		url := "/api/site/session"
		if share {
			url += "?share=true"
		}
		req := httptest.NewRequest("GET", url, nil)
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: token})
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		if res.Code != 200 {
			t.Fatal(res.Code, res.Body.String())
		}
		var value map[string]any
		if err := json.Unmarshal(res.Body.Bytes(), &value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	guest := read("", true)
	if guest["authenticated"] != false || calls != 0 {
		t.Fatal("guest acquired upstream identity")
	}
	token := logged["token"].(string)
	base := read(token, false)
	if base["authenticated"] != true || calls != 0 {
		t.Fatal("base identity contacted OpenList")
	}
	for range 2 {
		value := read(token, true)
		share := value["share"].(map[string]any)
		user := share["user"].(map[string]any)
		if share["token"] != "private-token" || user["base_path"] != "/Vault" || user["password"] != nil {
			t.Fatal("identity fields invalid")
		}
	}
	if calls != 2 {
		t.Fatal("duplicate upstream login", calls)
	}
	changed := []string{}
	server.DataChanged = func(table string) { changed = append(changed, table) }
	write := func(method, path, payload string, authorized bool) int {
		req := httptest.NewRequest(method, path, strings.NewReader(payload))
		req.Header.Set("Origin", "https://site.test")
		if authorized {
			req.AddCookie(&http.Cookie{Name: "quartz_stellar_session", Value: token})
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		return res.Code
	}
	path := "/api/site/admin/data/tables/video-meta"
	payload := `{"values":{"key":"last_success","value":"2026-11-10T00:00:00.000Z"}}`
	if code := write("POST", path, payload, false); code != 401 || len(changed) != 0 {
		t.Fatal("unauthorized edit reached module", code)
	}
	if code := write("POST", path, payload, true); code != 201 {
		t.Fatal("managed route changed", code)
	}
	if code := write("DELETE", path+"?"+url.Values{"key": {`{"key":"last_success"}`}}.Encode(), "", true); code != 200 {
		t.Fatal("managed delete changed", code)
	}
	if fmt.Sprint(changed) != "[video-meta video-meta]" {
		t.Fatal("missing committed-data notifications", changed)
	}
	if err = service.Logout(ctx, token); err != nil {
		t.Fatal(err)
	}
	value := read(token, true)
	if value["authenticated"] != false || value["share"].(map[string]any)["token"] != nil {
		t.Fatal("logged-out identity leaked token")
	}
}

func TestVideoIndexKeepsSeriesSeparateFromManualTags(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := video.Store{DB: db, MID: "1"}
	at := "2026-11-10T00:00:00.000Z"
	if _, err := store.Merge(ctx, []video.Video{{BVID: "BV1ua4W6XEJd", Title: "video", PublishedAt: &at}}, at, true); err != nil {
		t.Fatal(err)
	}
	series := map[string]any{"id": "series:1", "title": "Series", "kind": "series", "bvids": []string{"BV1ua4W6XEJd"}}
	if err := store.Put(ctx, "library", map[string]any{"collections": []any{series}, "updatedAt": at}); err != nil {
		t.Fatal(err)
	}
	items, err := store.Content(ctx)
	if err != nil || len(items) != 1 {
		t.Fatal(items, err)
	}
	catalog := content.Store{DB: db}
	if err = catalog.Sync(ctx, "video", items); err != nil {
		t.Fatal(err)
	}
	if _, err = catalog.EditTags(ctx, "video:BV1ua4W6XEJd", []string{"custom"}, false); err != nil {
		t.Fatal(err)
	}
	series["title"] = "Renamed"
	if err = store.Put(ctx, "library", map[string]any{"collections": []any{series}, "updatedAt": at}); err != nil {
		t.Fatal(err)
	}
	items, err = store.Content(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = catalog.Sync(ctx, "video", items); err != nil {
		t.Fatal(err)
	}
	value, err := catalog.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	entry := value["pages"].(map[string]content.Page)["Video/BV1ua4W6XEJd"]
	if fmt.Sprint(entry.Tags) != "[custom]" {
		t.Fatal("manual tags replaced")
	}
	groups := entry.Extra["series"].([]any)
	group := groups[0].(map[string]any)
	if group["id"] != "series:1" || group["title"] != "Renamed" {
		t.Fatal("directory series stale", groups)
	}
}

func TestAttendanceIsStoredAndReadByMonth(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	write := func(name string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("<!-- diary:attendance:start -->出勤<!-- diary:attendance:end -->"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("2026-10-01.md")
	write("2026-11-02.md")
	manager := &adapters.Manager{DB: db, DiaryDirectory: dir}
	if err := manager.RefreshAttendance(ctx); err != nil {
		t.Fatal(err)
	}
	for _, month := range []string{"2026-10", "2026-11", "2026-09"} {
		value, err := manager.Attendance(ctx, month)
		if err != nil {
			t.Fatal(err)
		}
		records := value["records"].([]any)
		expected := 1
		if month == "2026-09" {
			expected = 0
		}
		if len(records) != expected || value["month"] != month {
			t.Fatal("unexpected month snapshot", value)
		}
		for _, raw := range records {
			if !strings.HasPrefix(raw.(map[string]any)["date"].(string), month+"-") {
				t.Fatal("another month leaked")
			}
		}
	}
	meta, err := manager.Saved(ctx, "attendance")
	if err != nil || meta["records"] != nil {
		t.Fatal("metadata still holds full history", err)
	}
	server := httpapi.Server{DB: db, Adapters: manager, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	for _, month := range []string{"2026-00", "2026-13", "2026-1", "garbage"} {
		req := httptest.NewRequest("GET", "/api/attendance?month="+month, nil)
		res := httptest.NewRecorder()
		server.Handler().ServeHTTP(res, req)
		if res.Code != 400 {
			t.Fatal("invalid month accepted", month, res.Code)
		}
	}
	if err = os.Remove(filepath.Join(dir, "2026-10-01.md")); err != nil {
		t.Fatal(err)
	}
	if err = manager.RefreshAttendance(ctx); err != nil {
		t.Fatal(err)
	}
	value, err := manager.Attendance(ctx, "2026-10")
	if err != nil || len(value["records"].([]any)) != 0 {
		t.Fatal("deleted month retained", err)
	}
}

func TestContentOperationsReadOnlyTheirTargetRecords(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "selected.md"), []byte("---\ntags: [source]\n---\nBody"), 0600); err != nil {
		t.Fatal(err)
	}
	store := content.Store{DB: db, ArticleDirectory: dir}
	items := []content.Item{{SourceID: "selected", Slug: "Memo/selected", Title: "Selected", Tags: []string{"source"}, Extra: map[string]any{"filePath": "selected.md"}}, {SourceID: "unrelated", Slug: "Memo/unrelated", Title: "Unrelated"}}
	if err := store.Sync(ctx, "article", items); err != nil {
		t.Fatal(err)
	}
	// An invalid unrelated extension is a controlled isolation fixture: target
	// operations must not decode it or load all other articles' bodies.
	if _, err := db.Exec("UPDATE content SET extra='[]' WHERE id='article:unrelated'"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Tags(ctx, "article:selected"); err != nil {
		t.Fatal("tag read touched unrelated rows", err)
	}
	if _, err := store.EditTags(ctx, "article:selected", []string{"custom"}, false); err != nil {
		t.Fatal(err)
	}
	if err := store.ChangeTag(ctx, "another", []string{"article:selected"}, false); err != nil {
		t.Fatal(err)
	}
	if err := store.Sync(ctx, "video", []content.Item{{SourceID: "video", Slug: "Video/video", Title: "Video"}}); err != nil {
		t.Fatal("source sync touched other sources", err)
	}
}

func TestAdminPasswordChangeProvesFactorsAndRotatesAllSessions(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "totp.key"), []byte(strings.Repeat("02", 32)), 0600); err != nil {
		t.Fatal(err)
	}
	service, err := auth.New(db, dir)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1800000000, 0)
	service.Now = func() time.Time { return now }
	old, next := "old-password-for-test", "new-password-for-test"
	if err = service.SetPassword(ctx, old); err != nil {
		t.Fatal(err)
	}
	setup, err := service.Login(ctx, "192.0.2.10", auth.Input{Password: old})
	if err != nil {
		t.Fatal(err)
	}
	confirmed, err := service.Confirm(ctx, "192.0.2.10", auth.Input{SetupToken: setup["setupToken"].(string), Code: currentCode(setup["secret"].(string), now)})
	if err != nil {
		t.Fatal(err)
	}
	completed, err := service.Finish(ctx, "192.0.2.10", auth.Input{CompletionToken: confirmed["completionToken"].(string), Saved: true})
	if err != nil {
		t.Fatal(err)
	}
	original := completed["token"].(string)
	now = now.Add(30 * time.Second)
	if _, err = service.ChangePassword(ctx, "192.0.2.10", auth.Input{Password: old, NewPassword: next, Code: "bad"}); err == nil {
		t.Fatal("wrong second factor accepted")
	}
	if !service.Authenticated(ctx, original) {
		t.Fatal("failed change revoked existing session")
	}
	input := auth.Input{Password: old, NewPassword: next, Code: currentCode(setup["secret"].(string), now)}
	changed, err := service.ChangePassword(ctx, "192.0.2.10", input)
	if err != nil {
		t.Fatal(err)
	}
	if service.Authenticated(ctx, original) {
		t.Fatal("old session survived")
	}
	if !service.Authenticated(ctx, changed["token"].(string)) {
		t.Fatal("fresh session rejected")
	}
	if _, err = service.Login(ctx, "192.0.2.11", auth.Input{Password: old, Code: input.Code}); err == nil {
		t.Fatal("old password accepted")
	}
	if _, err = service.Login(ctx, "192.0.2.11", auth.Input{Password: next, Code: input.Code}); err == nil {
		t.Fatal("consumed second factor replayed")
	}
	now = now.Add(30 * time.Second)
	if _, err = service.Login(ctx, "192.0.2.11", auth.Input{Password: next, Code: currentCode(setup["secret"].(string), now)}); err != nil {
		t.Fatal("new password cannot login", err)
	}
}
