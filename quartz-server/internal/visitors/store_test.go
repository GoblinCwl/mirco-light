package visitors

import (
	"testing"
	"time"
)

func TestAddressIdentity(t *testing.T) {
	s := Store{Secret: []byte("01234567890123456789012345678901")}
	browser := "11111111-1111-4111-8111-111111111111"
	if s.Identity("::ffff:192.0.2.1", browser) != s.Identity("192.0.2.1", browser) {
		t.Fatal("mapped IPv4 changed identity")
	}
	if s.Identity("192.0.2.1", browser) != s.Identity("192.0.2.2", browser) {
		t.Fatal("IP change altered browser identity")
	}
	if s.Identity("192.0.2.1", "bad") != "" {
		t.Fatal("bad browser identity accepted")
	}
	for _, ip := range []string{"127.1", "192.0.2.1:80", "fe80::1%eth0"} {
		if NormalizeIP(ip) != "" {
			t.Errorf("invalid address accepted %s", ip)
		}
	}
	d := time.Date(2026, 11, 9, 17, 0, 0, 0, time.UTC)
	if day(d) != "2026-11-10" {
		t.Fatal("visitor day uses wrong timezone")
	}
}
func TestGeoLabels(t *testing.T) {
	raw := "中国|湖南省|长沙市|其他"
	if Region(raw) == nil || *Region(raw) != "湖南省" || City(raw) == nil || *City(raw) != "长沙市" {
		t.Fatal("region labels wrong")
	}
	if Region("0|内网|内网|0") != nil || City("0|内网|长沙市|0") != nil {
		t.Fatal("reserved location exposed")
	}
	if region := Region("中国|0|0|移动|CN"); region == nil || *region != "中国" || City("中国|0|0|移动|CN") != nil {
		t.Fatal("country-only IP data must not invent a province or city")
	}
}

func TestEmbeddedBrowsers(t *testing.T) {
	for _, test := range []struct{ ua, want string }{
		{"Mozilla/5.0 Chrome/120.0 MQQBrowser/6.2 QQ/9.1.0.123 Mobile Safari/537.36", "QQ"},
		{"Mozilla/5.0 (iPhone) Mobile/15E148 QQ/9.1.0.123 Safari/604.1", "QQ"},
		{"Mozilla/5.0 V1_AND_SQ_9.1.0_YYB_D Chrome/120.0", "QQ"},
		{"Mozilla/5.0 V1_IPH_SQ_9.1.0_1_APP_A Mobile/15E148", "QQ"},
		{"Mozilla/5.0 Chrome/120.0 MQQBrowser/6.2 MicroMessenger/8.0.50", "微信"},
		{"Mozilla/5.0 Chrome/120.0 MQQBrowser/14.0", "QQ浏览器"},
		{"Mozilla/5.0 Chrome/120.0 Edg/120.0", "Edge"},
		{"Mozilla/5.0 Chrome/120.0 Safari/537.36", "Chrome"},
		{"Mozilla/5.0 Version/17.0 Mobile/15E148 Safari/604.1", "Safari"},
	} {
		got := Browser(test.ua)
		if got == nil || *got != test.want {
			t.Errorf("%s: got %v, want %s", test.ua, got, test.want)
		}
	}
	if Browser("unidentified") != nil {
		t.Fatal("unidentified browser should remain unknown")
	}
}
