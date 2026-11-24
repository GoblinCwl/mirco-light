package integration

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"goblincwl/quartz-server/internal/datamanager"
	"goblincwl/quartz-server/internal/starbud"
	"goblincwl/quartz-server/internal/visitors"
)

func TestStarbudArchivesCompletedAndInterruptedReplies(t *testing.T) {
	db := testDB(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", starbud.StreamType)
		fmt.Fprint(w, "data: {\"type\":\"delta\",\"text\":\"星芽\"}\n\n")
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "完整问题") {
			fmt.Fprint(w, "data: {\"type\":\"done\",\"text\":\"星芽的完整回复\"}\n\n")
		}
	}))
	defer upstream.Close()
	store := starbud.Service{DB: db, BridgeToken: "test", ReadSettings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.astrbot.url": upstream.URL, "api.astrbot.token": "test"}, nil
	}}
	ctx := context.Background()
	user, ip := strings.Repeat("a", 64), strings.Repeat("f", 64)
	for _, question := range []string{"完整问题", "中断问题"} {
		input, err := starbud.Prepare(starbud.Input{Message: question, PageURL: "/test?p=discard#discard", ClientIP: "2001:db8::1"}, "https://goblincwl.site")
		if err != nil {
			t.Fatal(err)
		}
		err = store.StreamReply(ctx, time.Now(), user, ip, input, func(starbud.StreamEvent) error { return nil })
		if question == "完整问题" && err != nil || question == "中断问题" && !errors.Is(err, starbud.ErrUnavailable) {
			t.Fatalf("%s: %v", question, err)
		}
	}
	conversations, err := starbud.ListConversations(ctx, db, 1)
	if err != nil || conversations.Total != 1 || len(conversations.Items) != 1 ||
		conversations.Items[0].ID != user || conversations.Items[0].Turns != 2 ||
		conversations.Items[0].IP != "2001:db8::1" || conversations.Items[0].IPSource != "chat" {
		t.Fatalf("conversations: %+v, error: %v", conversations, err)
	}
	turns, err := starbud.ListTurns(ctx, db, user, 1)
	if err != nil || len(turns.Items) != 2 {
		t.Fatalf("turns: %+v, error: %v", turns, err)
	}
	for index, want := range []struct{ status, answer string }{
		{"已回复", "星芽的完整回复"}, {"回复中断", "星芽"},
	} {
		value := turns.Items[index]
		if value.Status != want.status || value.Answer == nil || *value.Answer != want.answer || value.PageURL != "https://goblincwl.site/test" {
			t.Fatalf("archive: %+v", value)
		}
	}
	if err := starbud.DeleteConversation(ctx, db, user); err != nil {
		t.Fatal(err)
	}
	deleted, err := starbud.ListTurns(ctx, db, user, 1)
	if err != nil || deleted.Total != 0 {
		t.Fatalf("deleted turns: %+v, error: %v", deleted, err)
	}
	quota, err := store.Quota(ctx, time.Now(), user, ip)
	if err != nil || quota.Remaining != starbud.UserLimit-2 {
		t.Fatalf("quota after archive deletion: %+v, error: %v", quota, err)
	}
}

func TestStarbudDailyQuotaIsAtomic(t *testing.T) {
	store := starbud.Service{DB: testDB(t)}
	ctx := context.Background()
	at := time.Date(2026, 11, 24, 15, 59, 0, 0, time.UTC)
	address := "2001:db8::1"
	visitorStore := visitors.Store{Secret: []byte(strings.Repeat("s", 32))}
	ip := visitorStore.IPIdentity(address)
	user := strings.Repeat("a", 64)
	var group sync.WaitGroup
	var accepted atomic.Int32
	for range 20 {
		group.Go(func() {
			err := store.Reserve(ctx, at, user, ip)
			if err == nil {
				accepted.Add(1)
			} else if !errors.Is(err, starbud.ErrLimit) {
				t.Errorf("reservation: %v", err)
			}
		})
	}
	group.Wait()
	if accepted.Load() != starbud.UserLimit {
		t.Fatalf("accepted %d turns", accepted.Load())
	}
	checkQuota := func(at time.Time, visitor string, want int) {
		t.Helper()
		quota, err := store.Quota(ctx, at, visitor, ip)
		if err != nil || quota.Remaining != want || !quota.ResetsAt.Equal(at.UTC().Truncate(24*time.Hour).Add(16*time.Hour)) {
			t.Fatalf("quota = %+v, err = %v, want %d and next Beijing midnight", quota, err, want)
		}
	}
	checkQuota(at, user, 0)
	checkQuota(at, strings.Repeat("b", 64), starbud.UserLimit)
	for i := 0; i < starbud.IPLimit-starbud.UserLimit; i++ {
		if err := store.Reserve(ctx, at, fmt.Sprintf("%064x", i), ip); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Reserve(ctx, at, strings.Repeat("b", 64), ip); !errors.Is(err, starbud.ErrLimit) {
		t.Fatalf("IP quota: %v", err)
	}
	checkQuota(at, strings.Repeat("b", 64), 0)
	manager := datamanager.Manager{DB: store.DB, IPIdentity: visitorStore.IPIdentity}
	usage, err := manager.List(ctx, "starbud-usage", 1, "2026-11-24")
	if err != nil {
		t.Fatal(err)
	}
	records := usage["records"].([]map[string]any)
	if len(records) != 1 {
		t.Fatalf("daily usage: %+v", usage)
	}
	values := records[0]["values"].(map[string]any)
	if fmt.Sprint(values["turns"]) != "30" || fmt.Sprint(values["visitors"]) != "21" || fmt.Sprint(values["networks"]) != "1" {
		t.Fatalf("daily usage values: %+v", values)
	}
	if err := manager.Remove(ctx, "starbud-usage", map[string]any{"day": "2026-11-24"}); err == nil {
		t.Fatal("daily usage must be read-only")
	}
	details, err := manager.List(ctx, "starbud-ip-usage", 1, address)
	if err != nil {
		t.Fatal(err)
	}
	ipRecords := details["records"].([]map[string]any)
	if len(ipRecords) != 1 {
		t.Fatalf("searching for legacy IP quota: %+v", details)
	}
	key := ipRecords[0]["key"].(map[string]any)
	if key["identity"] != ip || key["day"] != "2026-11-24" {
		t.Fatalf("IP quota key: %+v", key)
	}
	if err := manager.Remove(ctx, "starbud-ip-usage", key); err != nil {
		t.Fatal(err)
	}
	checkQuota(at, user, 0)
	checkQuota(at, strings.Repeat("b", 64), starbud.UserLimit)
	if err := store.Reserve(ctx, at.Add(time.Minute), user, ip); err != nil {
		t.Fatalf("Beijing midnight did not reset quota: %v", err)
	}
}
