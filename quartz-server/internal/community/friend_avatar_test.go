package community

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"goblincwl/quartz-server/internal/friendavatar"
	_ "modernc.org/sqlite"
)

func TestRefreshAvatarRetainsStateAndConcurrentEdits(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "friends.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE friends (id TEXT, number INTEGER, name TEXT, url TEXT, backlink_url TEXT, rss_url TEXT, avatar TEXT, avatar_source TEXT, latest_update TEXT, description TEXT, example INTEGER, status TEXT, review_result TEXT, review_checked_at TEXT, health_failures INTEGER, health_checked_on TEXT, health_error TEXT)`)
	if err != nil {
		t.Fatal(err)
	}
	old := friendavatar.Prefix + strings.Repeat("a", 64) + ".webp"
	next := friendavatar.Prefix + strings.Repeat("b", 64) + ".webp"
	_, err = db.Exec(`INSERT INTO friends VALUES ('fixture',1,'Fixture','https://site.test','','',?,'https://site.test/avatar.gif','2026-11-14','',0,'待审核','unchanged','',2,'','')`, old)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	s := Store{DB: db}
	s.StoreAvatar = func(ctx context.Context, source string) (string, error) {
		if source != "https://site.test/avatar.gif" {
			t.Fatal(source)
		}
		return next, nil
	}
	changed, err := s.RefreshAvatar(ctx, "fixture")
	if err != nil || !changed {
		t.Fatal(changed, err)
	}
	f, err := s.friendByID(ctx, "fixture")
	if err != nil || f.Avatar != next || f.Status != "待审核" || f.ReviewResult != "unchanged" || f.HealthFailures != 2 || f.LatestUpdate != "2026-11-14" {
		t.Fatal(f, err)
	}
	changed, err = s.RefreshAvatar(ctx, "fixture")
	if err != nil || changed {
		t.Fatal(changed, err)
	}
	s.StoreAvatar = func(context.Context, string) (string, error) { return "", errors.New("compression failed") }
	if _, err = s.RefreshAvatar(ctx, "fixture"); err == nil {
		t.Fatal("expected failure")
	}
	f, _ = s.friendByID(ctx, "fixture")
	if f.Avatar != next {
		t.Fatal("replaced avatar after failure")
	}
	s.StoreAvatar = func(context.Context, string) (string, error) {
		_, err := db.Exec("UPDATE friends SET avatar_source='https://site.test/new.gif' WHERE id='fixture'")
		return old, err
	}
	if _, err = s.RefreshAvatar(ctx, "fixture"); err == nil {
		t.Fatal("overwrote concurrent edit")
	}
	f, _ = s.friendByID(ctx, "fixture")
	if f.Avatar != next {
		t.Fatal("overwrote avatar")
	}
	if _, err = s.RefreshAvatar(ctx, "missing"); !errors.Is(err, ErrFriendNotFound) {
		t.Fatal(err)
	}
}
