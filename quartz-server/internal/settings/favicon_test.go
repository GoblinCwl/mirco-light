package settings

import "testing"

func TestFaviconMappings(t *testing.T) {
	value, err := validate("external.favicons", " WWW.Travellings.cn = https://www.travellings.cn/assets/favicon.png?a=1 \n\n")
	if err != nil || value != "www.travellings.cn=https://www.travellings.cn/assets/favicon.png?a=1" {
		t.Fatal(value, err)
	}
	for _, input := range []string{"bad", "https://example.com=https://example.com/icon", "*.example.com=https://example.com/icon", "example.com/path=https://example.com/icon", "example.com=javascript:alert(1)", "example.com=https://user:pass@example.com/a", "example.com=https://example.com/a\nEXAMPLE.com=https://example.com/b"} {
		if _, err := validate("external.favicons", input); err == nil {
			t.Errorf("accepted %q", input)
		}
	}
	if Sensitive("external.favicons") {
		t.Fatal("favicon mappings must be public")
	}
}
