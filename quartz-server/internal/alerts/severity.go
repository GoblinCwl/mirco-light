package alerts

import (
	"net"
	"net/url"
	"strings"
)

// Public platform failures are advisory; our own service failures stay errors.
// Source identifies integrated services even when their address is public HTTPS.
func APILevel(source, target string) string {
	switch source {
	case "Artalk", "OpenList", "Jellyfin", "Fontinass", "Beszel", "NapCat", "AstrBot", "ActivityWatch", "Gitea", "弹幕 API", "首页数据源":
		return "error"
	case "GitHub", "Bilibili", "一言", "平台凭据验证":
		return "warning"
	}
	parsed, err := url.Parse(target)
	if err == nil {
		host := parsed.Hostname()
		if host == "localhost" || (host != "" && !strings.Contains(host, ".")) || strings.HasSuffix(host, ".local") {
			return "error"
		}
		if ip := net.ParseIP(host); ip != nil && (ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()) {
			return "error"
		}
	}
	return "warning"
}
