package content

import (
	"html"
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

// Match whole absolute URLs first so an external URL's path cannot be mistaken
// for a root-relative site link. Markdown, HTML and plain descriptions all work.
var projectURLs = regexp.MustCompile(`(?i)https?://[^\s<>"'` + "`" + `]+|(?:^|[\s("'=])(/(?:Repo|Video|Share)/[^\s<>"'` + "`" + `]+)`)

func projectLinks(origin, source, self string) []string {
	site, err := url.Parse(origin)
	if err != nil || site.Host == "" {
		return nil
	}
	links := []string{}
	for _, match := range projectURLs.FindAllStringSubmatch(html.UnescapeString(source), -1) {
		raw := match[0]
		if match[1] != "" {
			raw = match[1]
		}
		raw = strings.TrimRight(raw, ").,;:!?]}>，。；：！？、）】")
		target, err := url.Parse(raw)
		if err != nil || target.User != nil {
			continue
		}
		target = site.ResolveReference(target)
		if (target.Scheme != "https" && target.Scheme != "http") || !strings.EqualFold(target.Host, site.Host) {
			continue
		}
		parts := strings.Split(strings.Trim(target.EscapedPath(), "/"), "/")
		valid := true
		for i, part := range parts {
			decoded, err := url.PathUnescape(part)
			if err != nil || decoded == "" || decoded == "." || decoded == ".." || strings.ContainsAny(decoded, `/\`) || strings.IndexFunc(decoded, unicode.IsControl) >= 0 {
				valid = false
				break
			}
			parts[i] = decoded
		}
		if !valid {
			continue
		}
		if !(len(parts) == 2 && (parts[0] == "Repo" || parts[0] == "Video") || len(parts) == 3 && parts[0] == "Share" && parts[1] == "分享") {
			continue
		}
		slug := strings.Join(parts, "/")
		if slug != self {
			links = append(links, slug)
		}
	}
	return unique(links)
}
