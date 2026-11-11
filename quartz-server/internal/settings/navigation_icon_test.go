package settings

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNavigationSVG(t *testing.T) {
	for _, source := range []string{"", "rss", `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 1h22v22"/></svg>`, `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"><stop stop-color="#fff"/></linearGradient></defs><circle r="10" fill="url(#paint)"/></svg>`} {
		data, _ := json.Marshal([]map[string]any{{"label": "链接", "href": "https://example.com", "order": 1, "icon": source}})
		value, err := validate("navigation.items", string(data))
		if err != nil || value != string(data) {
			t.Fatalf("valid SVG did not round-trip: %v", err)
		}
	}
	for _, source := range []string{
		`<svg><script>alert(1)</script></svg>`, `<svg onload="alert(1)"/>`,
		`<svg><foreignObject/></svg>`, `<svg><image href="https://example.com/a"/></svg>`,
		`<svg><use href="https://example.com/a#x"/></svg>`, `<svg><path style="fill:red"/></svg>`,
		`<svg fill="url(https://example.com/a)"/>`, `<svg/><svg/>`, `<svg>`,
		`<!DOCTYPE svg><svg/>`, `<svg xmlns="http://www.w3.org/1999/xhtml"/>`,
		`<svg fill="u\72l(https://example.com)"/>`, `<svg>` + strings.Repeat(" ", 16384) + `</svg>`,
	} {
		if validNavigationIcon(source) {
			t.Fatalf("accepted unsafe or malformed SVG: %.80s", source)
		}
	}
}

func TestRegistrationLinks(t *testing.T) {
	rows := []map[string]any{
		{"label": "ICP备案", "href": "https://beian.miit.gov.cn", "icon": "", "order": 10},
		{"label": "公安备案", "href": "https://beian.mps.gov.cn", "icon": `<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`, "order": 20},
	}
	data, _ := json.Marshal(rows)
	if _, err := validate("icp.items", string(data)); err != nil {
		t.Fatal(err)
	}
	rows[1]["icon"] = `<svg onload="alert(1)"/>`
	data, _ = json.Marshal(rows)
	if _, err := validate("icp.items", string(data)); err == nil {
		t.Fatal("accepted unsafe registration icon")
	}
	if _, err := validate("icp.items", "[]"); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"icp.label", "icp.url"} {
		if _, err := validate(key, "old"); err == nil {
			t.Fatalf("obsolete setting %s still accepted", key)
		}
	}
}
