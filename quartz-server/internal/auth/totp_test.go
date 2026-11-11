package auth

import (
	"encoding/hex"
	"testing"
)

func TestRFC6238(t *testing.T) {
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	for _, c := range []struct {
		seconds int64
		code    string
	}{{59, "287082"}, {1111111109, "081804"}, {1111111111, "050471"}, {1234567890, "005924"}, {2000000000, "279037"}, {20000000000, "353130"}} {
		got, err := totp(secret, c.seconds/30)
		if err != nil || got != c.code {
			t.Fatalf("%d: %s %v", c.seconds, got, err)
		}
	}
}
func TestReplayAndExpiry(t *testing.T) {
	secret := "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
	code, _ := totp(secret, 100)
	for _, test := range []struct {
		sec, last int64
		ok        bool
	}{{3000, -1, true}, {3030, -1, true}, {3060, -1, false}, {3000, 100, false}} {
		got, err := match(secret, code, test.sec, test.last)
		if err != nil || (got >= 0) != test.ok {
			t.Fatalf("unexpected match %v: %d %v", test, got, err)
		}
	}
	for _, code := range []string{"+12345", "-12345", "１２３４５６", "abcdef"} {
		if n, _ := match(secret, code, 3000, -1); n >= 0 {
			t.Fatal("invalid code accepted")
		}
	}
}
func TestSealingAndTamper(t *testing.T) {
	key, _ := hex.DecodeString("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
	sealed, err := seal("EXAMPLE", key)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := open(sealed, key)
	if err != nil || plain != "EXAMPLE" {
		t.Fatal("roundtrip failed")
	}
	sealed.Tag = "00000000000000000000000000000000"
	if _, err = open(sealed, key); err == nil {
		t.Fatal("tampered secret accepted")
	}
}
