package integration

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"strings"
	"testing"
	"time"
)

func TestFriendRefreshKeepsFailuresAndConcurrentEdits(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	old := "/api/site/friends/avatar/" + strings.Repeat("a", 64) + ".png"
	fresh := "/api/site/friends/avatar/" + strings.Repeat("b", 64) + ".png"
	ids := map[string]string{}
	for _, name := range []string{"a", "b", "c", "d", "e", "f", "g"} {
		f := community.Friend{Name: name, URL: "https://" + name + ".example/", BacklinkURL: "https://" + name + ".example/friends", Avatar: old, Status: "展示中"}
		if name != "d" && name != "f" && name != "g" {
			f.AvatarSource = "https://" + name + ".example/avatar.png"
		}
		if name != "d" && name != "e" {
			f.RSSURL = "https://" + name + ".example/feed.xml"
		}
		f.LatestUpdate = "2099-01-01T00:00:00.000Z"
		row, _, err := store.CreateFriend(ctx, f, false)
		if err != nil {
			t.Fatal(err)
		}
		if row.LatestUpdate != "" {
			t.Fatal("client supplied a computed timestamp")
		}
		ids[name] = row.ID
	}
	for _, name := range []string{"f", "g"} {
		if _, err := db.Exec("UPDATE friends SET latest_update='2000-01-01T00:00:00.000Z' WHERE id=?", ids[name]); err != nil {
			t.Fatal(err)
		}
	}
	store.StoreAvatar = func(ctx context.Context, source string) (string, error) {
		switch {
		case strings.Contains(source, "c.example"):
			return "", errors.New("fixture avatar failure")
		case strings.Contains(source, "b.example"):
			return old, nil
		case strings.Contains(source, "e.example"):
			_, err := db.ExecContext(ctx, "UPDATE friends SET avatar_source='https://new.example/avatar.png' WHERE id=?", ids["e"])
			if err != nil {
				t.Fatal(err)
			}
		}
		return fresh, nil
	}
	store.ReadFeed = func(ctx context.Context, source string) (time.Time, error) {
		if strings.Contains(source, "f.example") {
			return time.Time{}, errors.New("fixture feed failure")
		}
		if strings.Contains(source, "g.example") {
			if _, err := db.ExecContext(ctx, "UPDATE friends SET rss_url='https://new.example/feed.xml' WHERE id=?", ids["g"]); err != nil {
				t.Fatal(err)
			}
		}
		hour := map[byte]int{'a': 1, 'b': 2, 'c': 3, 'g': 4}[source[len("https://")]]
		return time.Date(2026, 11, 12, hour, 0, 0, 0, time.UTC), nil
	}
	result, err := store.RefreshLinks(ctx)
	if err == nil || result.Avatars != 1 || result.Feeds != 3 {
		t.Fatal(result, err)
	}
	friends, err := store.Friends(ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	if friends[0].Name != "c" || friends[1].Name != "b" || friends[2].Name != "a" {
		t.Fatal("RSS sort failed", friends)
	}
	byName := map[string]community.Friend{}
	for _, f := range friends {
		byName[f.Name] = f
	}
	if byName["a"].Avatar != fresh || byName["b"].Avatar != old || byName["c"].Avatar != old || byName["e"].Avatar != old {
		t.Fatal("failed or concurrent avatar replaced", byName)
	}
	if byName["f"].LatestUpdate != "2000-01-01T00:00:00.000Z" || byName["g"].LatestUpdate != "2000-01-01T00:00:00.000Z" {
		t.Fatal("failed or concurrent feed replaced", byName)
	}
	if byName["d"].LatestUpdate != "" || byName["d"].AvatarSource != "" {
		t.Fatal("unconfigured sources changed")
	}
	updated := byName["a"]
	updated.RSSURL = ""
	if _, err := store.UpdateFriend(ctx, updated.ID, updated, "update", 0); err != nil {
		t.Fatal(err)
	}
	var latest string
	if err := db.QueryRow("SELECT latest_update FROM friends WHERE id=?", updated.ID).Scan(&latest); err != nil || latest != "" {
		t.Fatal("removed feed kept derived timestamp", latest, err)
	}
}
