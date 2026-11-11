package alerts

import "testing"

func TestExternalFailuresAreWarningsAndIntegratedFailuresRemainErrors(t *testing.T) {
	for _, test := range []struct{ source, target, want string }{
		{"GitHub", "https://api.github.com", "warning"},
		{"Bilibili", "https://api.bilibili.com", "warning"},
		{"仓库平台", "https://api.github.com", "warning"},
		{"仓库平台", "http://gitea:3000", "error"},
		{"Jellyfin", "https://media.example.test", "error"},
		{"首页数据源", "http://192.168.1.2:6185", "error"},
	} {
		if got := APILevel(test.source, test.target); got != test.want {
			t.Fatal(test, got)
		}
	}
	for _, kind := range []string{"api", "task"} {
		source := "GitHub"
		if kind == "task" {
			source = "GitHub 用户与活动"
		}
		event, err := normalize(Event{Kind: kind, Level: "error", Source: source, Title: "failed", Target: "https://api.github.com"})
		if err != nil || event.Level != "warning" {
			t.Fatal(event, err)
		}
	}
}
