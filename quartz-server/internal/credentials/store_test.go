package credentials

import "testing"

func TestCredentialInput(t *testing.T) {
	for _, test := range [][2]string{{"github", "Bearer github_pat_test123"}, {"bilibili", "Cookie: SESSDATA=test; bili_jct=test"}} {
		value, err := clean(test[0], test[1])
		if err != nil || value == "" {
			t.Fatal(err)
		}
	}
	for _, test := range [][2]string{{"github", "bad/token"}, {"github", "token\nextra"}, {"bilibili", "cookie=missing"}, {"other", "anything"}} {
		if _, err := clean(test[0], test[1]); err == nil {
			t.Fatal("invalid credential accepted")
		}
	}
}
