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
var projectURLs = regexp.MustCompile(`(?i)https?://[^\s<>"'` + "`" + `]+|(?:^|[\s("'=])(/[^\s<>"'` + "`" + `]+)`)

func projectLinks(origin, source, self string, routeMaps ...map[string]string) []string {
	site, err := url.Parse(origin)
	if err != nil || site.Host == "" {
		return nil
	}
	links := []string{}
	for _, match := range projectURLs.FindAllStringSubmatch(html.UnescapeString(source), -1) {
		raw := match[0]
		if strings.HasPrefix(match[1], "//") {
			continue
		}
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
		slug := strings.Join(parts, "/")
		route := relationKey(slug)
		if route == "reading" || route == "friends" || route == "observatory" || route == "archives" || route == "tags" || strings.HasPrefix(route, "tags/") {
			continue
		}
		if len(routeMaps) > 0 {
			if canonical, ok := routeMaps[0][relationKey(slug)]; ok {
				slug = canonical
			} else if !(len(parts) == 2 && (parts[0] == "Repo" || parts[0] == "Video") || len(parts) == 3 && parts[0] == "Share" && parts[1] == "分享") {
				continue
			}
		} else if !(len(parts) == 2 && (parts[0] == "Repo" || parts[0] == "Video") || len(parts) == 3 && parts[0] == "Share" && parts[1] == "分享") {
			continue
		}

		if slug != relationKey(self) {
			links = append(links, slug)
		}
	}
	return unique(links)
}

// Article identities in graph edges use Quartz's simplified /index convention.
func relationKey(value string) string {
	value = strings.Trim(value, "/")
	value = strings.TrimSuffix(value, ".html")
	if value == "index" {
		return "/"
	}
	return strings.TrimSuffix(value, "/index")
}
func relationRoutes(records []Record, kind string, input []Item) map[string]string {
	routes := map[string]string{}
	add := func(slug, href string, extra map[string]any) {
		canonical := relationKey(slug)
		routes[canonical] = canonical
		if u, err := url.Parse(href); err == nil && !u.IsAbs() && strings.HasPrefix(u.Path, "/") {
			routes[relationKey(u.Path)] = canonical
		}
		switch aliases := extra["aliases"].(type) {
		case []any:
			for _, alias := range aliases {
				if alias, ok := alias.(string); ok {
					routes[relationKey(alias)] = canonical
				}
			}
		case []string:
			for _, alias := range aliases {
				routes[relationKey(alias)] = canonical
			}
		}
	}
	for _, record := range records {
		if record.Type != kind {
			add(record.Slug, record.Href, record.Extra)
		}
	}
	for _, item := range input {
		add(item.Slug, item.Href, item.Extra)
	}
	// A real content route takes precedence over an alias with the same name.
	for _, record := range records {
		if record.Type != kind {
			routes[relationKey(record.Slug)] = relationKey(record.Slug)
		}
	}
	for _, item := range input {
		routes[relationKey(item.Slug)] = relationKey(item.Slug)
	}
	return routes
}
