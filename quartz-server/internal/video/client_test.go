package video

import (
	"encoding/json"
	"testing"
)

func TestVideoNormalization(t *testing.T) {
	var item map[string]any
	if err := json.Unmarshal([]byte(`{"bvid":"BV1ua4W6XEJd","title":"<b>标题</b>","pic":"//i0.hdslb.com/example.jpg","created":1600000000,"length":"1:02:03","play":10,"video_review":2,"comment":1}`), &item); err != nil {
		t.Fatal(err)
	}
	v, ok := normalizedVideo(item)
	if !ok || v.Duration != 3723 || v.Title != "标题" || v.Cover != "https://i0.hdslb.com/example.jpg@480w_270h_1c.webp" || v.Play != 10 {
		t.Fatalf("normalization changed: %+v", v)
	}
	for _, bad := range []string{"", "-1:20", "bad"} {
		if ParseDuration(bad) != 0 {
			t.Errorf("accepted bad duration %q", bad)
		}
	}
}
func TestWBISignature(t *testing.T) {
	value, err := SignWBI(map[string]string{"foo": "114", "bar": "514", "baz": "1919810"}, "7cd084941338484aae1ad9425b84077c", "4932caff0ff746eab6f01bf08b70ac45", 1702204169)
	if err != nil {
		t.Fatal(err)
	}
	expected := "bar=514&baz=1919810&foo=114&wts=1702204169&w_rid=6149fdadf571698ca7e6a567265cd0ee"
	if value != expected {
		t.Fatalf("WBI signature mismatch: %s", value)
	}
}
