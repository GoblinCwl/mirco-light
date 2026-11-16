package integration

import (
	"context"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/datamanager"
	"goblincwl/quartz-server/internal/friendmail"
	"strings"
	"testing"
)

func TestFeedbackResolvedMailAcrossEntryPoints(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	store := community.Store{DB: db}
	f, err := store.Submit(ctx, community.Feedback{Email: "fixture@example.test", Description: strings.Repeat("长", 2000)}, "test")
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err = store.UpdateFeedback(ctx, f.ID, "已解决", false); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE kind='feedback'").Scan(&count)
	if count != 1 {
		t.Fatal("duplicate resolution mail", count)
	}
	mails := friendmail.Store{DB: db, Send: func(_ context.Context, m friendmail.Message) error {
		if m.Kind != "feedback" || m.To != f.Email || m.Reason != f.Description {
			t.Fatal("wrong mail payload")
		}
		return nil
	}}
	if ok, err := mails.Deliver(ctx); !ok || err != nil {
		t.Fatal(err)
	}
	if err = store.UpdateFeedback(ctx, f.ID, "待处理", false); err != nil {
		t.Fatal(err)
	}
	manager := datamanager.Manager{DB: db}
	for i := 0; i < 2; i++ {
		if _, err = manager.Save(ctx, "feedback", map[string]any{"status": "已解决"}, map[string]any{"id": f.ID}); err != nil {
			t.Fatal(err)
		}
	}
	db.QueryRow("SELECT count(*) FROM friend_mail_outbox WHERE kind='feedback'").Scan(&count)
	if count != 2 {
		t.Fatal("generic editor missing mail or duplicates", count)
	}
}
