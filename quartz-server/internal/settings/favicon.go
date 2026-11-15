package settings

import (
	"errors"
	"net/url"
	"strings"
)

func validateFavicons(value string) (string, error) {
	rows := []string{}
	seen := map[string]bool{}
	for _, line := range strings.Split(value, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			return faviconError("每行填写 域名=完整图标地址")
		}
		host, address := strings.ToLower(strings.TrimSpace(parts[0])), strings.TrimSpace(parts[1])
		domain, err := url.Parse("https://" + host)
		if err != nil || host == "" || domain.Host != host || domain.Hostname() != host || domain.User != nil || domain.Path != "" || domain.RawQuery != "" || domain.Fragment != "" || strings.ContainsAny(host, "*\\ \t\r?#") {
			return faviconError("请输入不含协议、端口或路径的域名")
		}
		target, err := url.Parse(address)
		if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Hostname() == "" || target.User != nil || strings.ContainsAny(address, "\r\n\t ") {
			return faviconError("图标地址需要是完整的 HTTP 或 HTTPS 链接，不能包含账号密码")
		}
		if seen[host] {
			return faviconError("同一个域名只能配置一次")
		}
		seen[host] = true
		rows = append(rows, host+"="+address)
	}
	if len(rows) > 60 {
		return faviconError("最多配置60个域名")
	}
	return strings.Join(rows, "\n"), nil
}

func faviconError(message string) (string, error) { return "", errors.New(message) }
