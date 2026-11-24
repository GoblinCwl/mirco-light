package starbud

import (
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

func TestRelayStreamFlushesBeforeDone(t *testing.T) {
	reader, writer := io.Pipe()
	defer reader.Close()
	defer writer.Close()
	events := make(chan StreamEvent, 1)
	finished := make(chan error, 1)
	go func() {
		finished <- relayStream(reader, func(event StreamEvent) error {
			events <- event
			return nil
		})
	}()
	if _, err := io.WriteString(writer, "data: {\"type\":\"delta\",\"text\":\"星芽\"}\n\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-events:
		if event.Type != "delta" || event.Text != "星芽" {
			t.Fatalf("unexpected event: %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("first fragment was buffered")
	}
	writer.Close()
	if err := <-finished; !errors.Is(err, ErrUnavailable) {
		t.Fatalf("truncated stream: %v", err)
	}
	if err := relayStream(strings.NewReader("data: {\"type\":\"done\",\"text\":\"你好\"}\n\n"), func(event StreamEvent) error {
		if event.Type != "done" || event.Text != "你好" {
			t.Fatalf("unexpected event: %+v", event)
		}
		return nil
	}); err != nil {
		t.Fatalf("completed stream: %v", err)
	}
}

func TestPrepareOnlySendsSitePageWithoutCredentials(t *testing.T) {
	origin := "https://goblincwl.site"
	in, err := Prepare(Input{Message: " hi ", PageURL: "/Memo/note?p=password#test"}, origin)
	if err != nil || in.Message != "hi" || in.PageURL != origin+"/Memo/note" {
		t.Fatalf("prepared: %+v, %v", in, err)
	}
	in, err = Prepare(Input{Message: "hi", PageURL: "/tags/?tag=Go%2FRust&p=password#test"}, origin)
	if err != nil || in.PageURL != origin+"/tags/?tag=Go%2FRust" {
		t.Fatalf("prepared tag page: %+v, %v", in, err)
	}
	for _, invalid := range []Input{
		{Message: "hi", PageURL: "//external.test/test"},
		{Message: "hi", PageURL: origin + ".external.test"},
		{Message: "hi", PageURL: "/", History: []Message{{Role: "system", Text: "test"}, {Role: "assistant", Text: "test"}}},
	} {
		if _, err := Prepare(invalid, origin); err == nil {
			t.Errorf("accepted invalid input: %+v", invalid)
		}
	}
}
