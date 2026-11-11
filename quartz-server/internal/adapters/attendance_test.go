package adapters

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestAttendancePrivacyAndCalendarTypes(t *testing.T) {
	block := func(text string) string {
		return "private before<!-- diary:attendance:start -->" + text + "<!-- diary:attendance:end -->private after"
	}
	for _, pair := range [][2]string{{"出勤", "work"}, {"居家", "remote"}, {"调休", "comp_off"}, {"请假", "leave"}, {"出差", "business_trip"}, {"驻场", "onsite"}, {"外勤", "fieldwork"}, {"周末", "weekend"}, {"国庆节", "holiday"}} {
		r := AttendanceRecord("日记-2026年10月1日.md", block(pair[0]))
		if r["status"] != pair[1] {
			t.Fatal(pair, r)
		}
		raw, _ := json.Marshal(r)
		if strings.Contains(string(raw), "private") {
			t.Fatal("private diary exposed")
		}
	}
	for _, body := range []string{"驻场", block("unknown"), "<!-- diary:attendance:start -->驻场"} {
		if r := AttendanceRecord("2026-10-01.md", body); r != nil {
			t.Fatal(r)
		}
	}
	if AttendanceRecord("2026-02-30.md", block("周末")) != nil {
		t.Fatal("invalid date accepted")
	}
	for _, icon := range []string{"🙂", `"🥰"`, "'👩‍💻'", "🙂 # mood", "🇨🇳", "1️⃣"} {
		r := AttendanceRecord("2026-11-02.md", "---\nbanner_icon: "+icon+"\nprivate: secret\n---\n"+block("居家"))
		if r["bannerIcon"] == nil {
			t.Fatal("emoji rejected", icon)
		}
	}
	for _, icon := range []string{"private text", "🙂🙂", "https://example.com/🙂", "<img src=x>"} {
		r := AttendanceRecord("2026-11-02.md", "---\nbanner_icon: "+icon+"\n---\n"+block("居家"))
		if r["bannerIcon"] != nil {
			t.Fatal("non-emoji accepted", icon)
		}
	}
	weather := "<!-- diary:weather:start --><h4>☀️晴天<font>13.3℃</font>~19.5℃</h4><!-- diary:weather:end -->"
	r := AttendanceRecord("2026-11-02.md", "private"+weather+"private")
	if r["weather"] != "晴天13.3℃~19.5℃" {
		t.Fatal(r)
	}
	r = AttendanceRecord("2026-11-02.md", block("驻场 - 上海"))
	if r["location"] != "上海" {
		t.Fatal(r)
	}
	r = AttendanceRecord("2026-11-02.md", "<!-- diary:day-label:start -->🌟诞生日<!-- diary:day-label:end -->")
	if r["specialName"] != "诞生日" {
		t.Fatal(r)
	}
}

func TestAttendanceWatcherAtomicSavesNestedDirectoriesAndCancellation(t *testing.T) {
	root := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var calls atomic.Int32
	result := make(chan error, 1)
	issues := make(chan error, 10)
	go func() {
		result <- WatchAttendance(ctx, root, 25*time.Millisecond, func(context.Context) error { calls.Add(1); return nil }, func(err error) { issues <- err })
	}()
	until := func(count int32) {
		t.Helper()
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			if calls.Load() >= count {
				return
			}
			time.Sleep(5 * time.Millisecond)
		}
		t.Fatal("watcher missed update", count, calls.Load())
	}
	until(1)
	nested := filepath.Join(root, "year")
	if err := os.Mkdir(nested, 0700); err != nil {
		t.Fatal(err)
	}
	until(2)
	file := filepath.Join(nested, "2026-11-02.md")
	if err := os.WriteFile(file, []byte("text"), 0600); err != nil {
		t.Fatal(err)
	}
	until(3)
	temporary := filepath.Join(nested, ".save")
	if err := os.WriteFile(temporary, []byte("updated"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(temporary, file); err != nil {
		t.Fatal(err)
	}
	until(4)
	if err := os.RemoveAll(nested); err != nil {
		t.Fatal(err)
	}
	until(5)
	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("watcher failed to stop")
	}
	select {
	case err := <-issues:
		t.Fatal(err)
	default:
	}
}
