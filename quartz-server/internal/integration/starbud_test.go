package integration

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"goblincwl/quartz-server/internal/content"
	"goblincwl/quartz-server/internal/datamanager"
	"goblincwl/quartz-server/internal/httpapi"
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

func TestStarbudReadsUnlockedPageWithinOneTurn(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	const origin = "https://site.test"
	const browser = "36ed4a5a-349c-41db-ada3-98aa0b5227b3"
	const other = "ac02fd3e-a19b-4897-a3ee-31ad9b110689"
	const requestID = "7f2992d86680490cb6ba6c93a41d9a27"
	const excerpt = "synthetic private passage"
	store := content.Store{DB: db, Origin: origin}
	if err := store.Sync(ctx, "article", []content.Item{{
		SourceID: "Memo/locked", Slug: "Memo/locked", Title: "Protected", Encrypted: true,
		Extra: map[string]any{"aliases": []string{"locked-alias"}},
	}}); err != nil {
		t.Fatal(err)
	}
	work, err := store.LookupKnowledgeWork(ctx, "", "/locked-alias")
	if err != nil || work == nil {
		t.Fatalf("indexed alias: %v, %v", work, err)
	}

	result := make(chan starbud.ContextResult, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/context") {
			var payload starbud.ContextResult
			if json.NewDecoder(r.Body).Decode(&payload) != nil {
				w.WriteHeader(400)
				return
			}
			result <- payload
			w.WriteHeader(204)
			return
		}
		var input struct {
			TurnID  string `json:"turn_id"`
			PageURL string `json:"page_url"`
		}
		raw, _ := io.ReadAll(r.Body)
		if json.Unmarshal(raw, &input) != nil || len(input.TurnID) != 26 ||
			input.PageURL != origin+"/locked-alias" || bytes.Contains(raw, []byte(excerpt)) || bytes.Contains(raw, []byte("test-pass")) {
			t.Error("initial request carries an invalid context")
			w.WriteHeader(400)
			return
		}
		w.Header().Set("Content-Type", starbud.StreamType)
		fmt.Fprintf(w, "data: {\"type\":\"read_request\",\"action\":\"find_text\",\"request_id\":%q}\n\n", requestID)
		_ = http.NewResponseController(w).Flush()
		select {
		case answer := <-result:
			if answer.TurnID != input.TurnID || answer.RequestID != requestID || !bytes.Contains(answer.Result, []byte(excerpt)) {
				t.Error("bridge received an invalid result")
			}
			fmt.Fprint(w, "data: {\"type\":\"done\",\"text\":\"received\"}\n\n")
		case <-r.Context().Done():
		case <-time.After(time.Second * 8):
			t.Error("context callback timed out")
		}
	}))
	defer upstream.Close()
	visitor := &visitors.Store{Secret: []byte("01234567890123456789012345678901")}
	service := &starbud.Service{DB: db, BridgeToken: "test", ReadSettings: func(context.Context) (map[string]any, error) {
		return map[string]any{"api.astrbot.url": upstream.URL, "api.astrbot.token": "test"}, nil
	}}
	server := httptest.NewServer((&httpapi.Server{DB: db, Origin: origin, Starbud: service, Visitors: visitor, Log: slog.Default()}).Handler())
	defer server.Close()
	client := &http.Client{Timeout: 10 * time.Second}
	post := func(path, id, host string, payload any) *http.Response {
		t.Helper()
		encoded, _ := json.Marshal(payload)
		req, err := http.NewRequest(http.MethodPost, server.URL+path, bytes.NewReader(encoded))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Accept", starbud.StreamType)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", host)
		req.Header.Set("X-Visitor-ID", id)
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { response.Body.Close() })
		return response
	}
	unlock := &starbud.Unlock{WorkID: work.WorkID, Unlocked: true}
	if res := post("/api/starbud/chat", browser, origin, starbud.Input{Message: "question", PageURL: "/other", Unlock: unlock}); res.StatusCode != 400 {
		t.Fatalf("wrong page: %d", res.StatusCode)
	}
	res := post("/api/starbud/chat", browser, origin, starbud.Input{Message: "question", PageURL: "/locked-alias?p=test-pass", Unlock: unlock})
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("chat: %d", res.StatusCode)
	}
	line, err := bufio.NewReader(res.Body).ReadString('\n')
	var event starbud.StreamEvent
	if err != nil || json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &event) != nil || event.RequestID != requestID || event.TurnID == "" {
		t.Fatalf("read request: %q, %v", line, err)
	}
	payload := starbud.ContextResult{TurnID: event.TurnID, RequestID: event.RequestID, Result: json.RawMessage(`{"text":"` + excerpt + `"}`)}
	for _, test := range []struct {
		id, origin string
		status     int
	}{
		{browser, "https://elsewhere.test", 403}, {other, origin, 404}, {browser, origin, 204}, {browser, origin, 404},
	} {
		res := post("/api/starbud/chat/context", test.id, test.origin, payload)
		if res.StatusCode != test.status {
			t.Fatalf("callback status = %d, want %d", res.StatusCode, test.status)
		}
		res.Body.Close()
	}
	user, ip := visitor.Identity("127.0.0.1", browser), visitor.IPIdentity("127.0.0.1")
	quota, err := service.Quota(ctx, time.Now(), user, ip)
	if err != nil || quota.Remaining != starbud.UserLimit-1 {
		t.Fatalf("quota: %+v, %v", quota, err)
	}
	turns, err := starbud.ListTurns(ctx, db, user, 1)
	if err != nil || turns.Total != 0 {
		t.Fatalf("private turn archive: total %d, %v", turns.Total, err)
	}
}
