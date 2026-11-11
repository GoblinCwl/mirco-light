package openlist

import (
	"testing"
)

func TestShareMetadata(t *testing.T) {
	valid, err := ParseMetadata(`{"tags":[" a ","a"],"sharedAt":"2026-11-10T12:00:00+08:00","jellyfin":true,"comment":true,"order":1}`, true)
	if err != nil || len(valid.Tags) != 1 || valid.SharedAt != "2026-11-10T04:00:00.000Z" || valid.Jellyfin == nil || !*valid.Jellyfin {
		t.Fatal(valid, err)
	}
	for _, raw := range []string{`null`, `[]`, `{"tags":null}`, `{"jellyfin":1}`, `{"order":1.1}`, `{"aliases":{"/../private":"x"}}`, `{"tags":["../private"]}`} {
		fallback, err := ParseMetadata(raw, false)
		if err != nil || len(fallback.Tags) != 0 || fallback.Comment {
			t.Fatal("invalid remark leaked fields")
		}
		if _, err = ParseMetadata(raw, true); err == nil {
			t.Errorf("strict accepted %s", raw)
		}
	}
}
