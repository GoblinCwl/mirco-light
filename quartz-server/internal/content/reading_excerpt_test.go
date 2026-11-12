package content

import (
	"strings"
	"testing"
)

func TestReadingExcerptHasEnoughProseForTallCards(t *testing.T) {
	text := strings.Repeat("正文", 1600)
	got, truncated := readingExcerpt(text)
	if len([]rune(got)) != 2400 || !truncated {
		t.Fatal("long preview must be bounded and marked truncated")
	}
	got, truncated = readingExcerpt("完整短文")
	if got != "完整短文" || truncated {
		t.Fatal("short content must remain complete")
	}
}

func TestReadingExcerptStillScrubsEncryptedSegments(t *testing.T) {
	for _, value := range []string{"公开🔐γsecret🔐后文", "公开🔐βunfinished-secret"} {
		got, _ := readingExcerpt(value)
		if strings.Contains(got, "secret") || !strings.Contains(got, "[加密文本]") {
			t.Fatal("encrypted preview leaked")
		}
	}
}
