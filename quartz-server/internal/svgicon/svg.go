package svgicon

import (
	"encoding/xml"
	"io"
	"regexp"
	"strings"
)

var iconReference = regexp.MustCompile(`^#[\w:.-]+$`)
var iconPaint = regexp.MustCompile(`(?i)^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$`)
var iconURL = regexp.MustCompile(`(?i)url\s*\(`)

// SVG drawing only: no scripts, styles, HTML, animations or external resources.
// The stored source is not rewritten, so editing can return the exact code.
func Valid(source string) bool {
	source = strings.TrimSpace(source)
	if source == "" {
		return true
	}
	if len(source) > 16384 {
		return false
	}
	allowed := " svg g path circle ellipse rect line polyline polygon defs lineargradient radialgradient stop clippath mask use symbol title desc text tspan "
	decoder := xml.NewDecoder(strings.NewReader(source))
	depth, nodes := 0, 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return depth == 0 && nodes > 0
		}
		if err != nil {
			return false
		}
		switch t := token.(type) {
		case xml.StartElement:
			if depth == 0 && (nodes > 0 || t.Name.Local != "svg") {
				return false
			}
			depth++
			nodes++
			if depth > 32 || nodes > 512 || !strings.Contains(allowed, " "+strings.ToLower(t.Name.Local)+" ") || t.Name.Space != "" && t.Name.Space != "http://www.w3.org/2000/svg" {
				return false
			}
			for _, attr := range t.Attr {
				key, value := strings.ToLower(attr.Name.Local), strings.TrimSpace(attr.Value)
				if strings.HasPrefix(key, "on") || key == "style" || key == "src" || strings.Contains(value, `\`) {
					return false
				}
				if key == "href" && !iconReference.MatchString(value) || iconURL.MatchString(value) && !iconPaint.MatchString(value) {
					return false
				}
				if attr.Name.Space != "" && attr.Name.Space != "xmlns" && attr.Name.Space != "http://www.w3.org/1999/xlink" {
					return false
				}
			}
		case xml.EndElement:
			depth--
		case xml.Directive:
			return false
		case xml.ProcInst:
			if t.Target != "xml" || nodes != 0 {
				return false
			}
		case xml.CharData:
			if depth == 0 && strings.TrimSpace(string(t)) != "" {
				return false
			}
		}
	}
}
