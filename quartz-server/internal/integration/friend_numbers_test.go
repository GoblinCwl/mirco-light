package integration

import (
	"context"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/datamanager"
	"os"
	"strings"
	"testing"
)

func TestFriendNumbersPersistAcrossRSSSortingAndDeletion(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	create := func(name string) community.Friend {
		t.Helper()
		f, _, err := store.CreateFriend(ctx, community.Friend{Name: name, URL: "https://" + name + ".example", BacklinkURL: "https://" + name + ".example/friends", Status: "展示中"}, false)
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	a, b := create("alpha"), create("beta")
	if a.Number <= 0 || b.Number <= a.Number {
		t.Fatal(a.Number, b.Number)
	}
	if _, err := db.Exec("UPDATE friends SET latest_update='2026-11-13T00:00:00.000Z' WHERE id=?", b.ID); err != nil {
		t.Fatal(err)
	}
	rows, err := store.Friends(ctx, true)
	if err != nil || len(rows) != 2 || rows[0].ID != b.ID || rows[0].Number != b.Number || rows[1].Number != a.Number {
		t.Fatal(rows, err)
	}
	if _, err := store.UpdateFriend(ctx, b.ID, community.Friend{}, "delete", 0); err != nil {
		t.Fatal(err)
	}
	c := create("gamma")
	if c.Number <= b.Number {
		t.Fatal("deleted number reused", c.Number, b.Number)
	}
	if _, err := store.UpdateFriend(ctx, a.ID, community.Friend{}, "move", 1); err == nil {
		t.Fatal("obsolete move accepted")
	}
	manager := datamanager.Manager{DB: db}
	result, err := manager.Save(ctx, "friends", map[string]any{"name": "generic", "url": "https://generic.example", "backlink_url": "https://generic.example/friends", "avatar": "", "description": "", "status": "待审核"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var assigned int64
	if err = db.QueryRow("SELECT number FROM friends WHERE id=?", result["key"].(map[string]any)["id"]).Scan(&assigned); err != nil || assigned <= c.Number {
		t.Fatal("generic create omitted number", assigned, err)
	}
	catalog, err := manager.Catalog(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range catalog {
		if table["id"] == "friends" {
			for _, field := range table["fields"].([]datamanager.Field) {
				if field.Name == "position" {
					t.Fatal("obsolete sort column retained")
				}
			}
		}
	}
	var count int
	if err := db.QueryRow("SELECT count(DISTINCT number) FROM friends").Scan(&count); err != nil || count != 3 {
		t.Fatal(count, err)
	}
}

func TestFriendNumberMigrationPreservesExistingPublicCardNumbers(t *testing.T) {
	db := testDB(t)
	if _, err := db.Exec("ALTER TABLE friends DROP INDEX friends_updated,DROP INDEX friends_number,DROP COLUMN number,ADD COLUMN position bigint NOT NULL DEFAULT 0"); err != nil {
		t.Fatal(err)
	}
	for _, f := range []struct {
		id, status, updated string
		position            int
	}{{"pending", "待审核", "2026-11-14T00:00:00.000Z", 0}, {"old", "展示中", "2026-11-01T00:00:00.000Z", 0}, {"new", "展示中", "2026-11-13T00:00:00.000Z", 1}} {
		if _, err := db.Exec("INSERT INTO friends(id,name,url,avatar,description,example,status,latest_update,position) VALUES(?,?,?,'','',0,?,?,?)", f.id, f.id, "https://"+f.id+".example", f.status, f.updated, f.position); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec("ALTER TABLE friends ADD KEY friends_order(position,id)"); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile("../../database/migrations/20261113_friend_numbers.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range strings.Split(string(raw), ";") {
		if strings.TrimSpace(statement) != "" {
			if _, err = db.Exec(statement); err != nil {
				t.Fatal(statement, err)
			}
		}
	}
	public, err := (community.Store{DB: db}).Friends(context.Background(), true)
	if err != nil || len(public) != 2 || public[0].ID != "new" || public[0].Number != 1 || public[1].Number != 2 {
		t.Fatal(public, err)
	}
}
