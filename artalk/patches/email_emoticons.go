package template

import (
	"golang.org/x/net/html"
	"strings"
)

// Email clients may discard <style> blocks or custom-attribute selectors.
// Keep the dimensions on the actual emoticon image, including an HTML height
// attribute for clients with limited CSS support. Ordinary images are untouched.
func inlineEmailEmoticons(body string) string {
	var out strings.Builder
	tokenizer := html.NewTokenizer(strings.NewReader(body))
	for {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			break
		}
		raw := string(tokenizer.Raw())
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			out.WriteString(raw)
			continue
		}
		token := tokenizer.Token()
		marked := false
		if token.Data == "img" {
			for _, attr := range token.Attr {
				if attr.Key == "atk-emoticon" {
					marked = true
				}
				if attr.Key == "class" {
					for _, name := range strings.Fields(attr.Val) {
						if name == "atk-emoticon" || name == "atk-emo" {
							marked = true
						}
					}
				}
			}
		}
		if !marked {
			out.WriteString(raw)
			continue
		}
		attrs := make([]html.Attribute, 0, len(token.Attr)+2)
		for _, attr := range token.Attr {
			if attr.Key != "width" && attr.Key != "height" && attr.Key != "style" {
				attrs = append(attrs, attr)
			}
		}
		token.Attr = append(attrs,
			html.Attribute{Key: "height", Val: "32"},
			html.Attribute{Key: "style", Val: "display:inline-block!important;height:32px!important;max-height:32px!important;width:auto!important;max-width:none!important;vertical-align:text-bottom!important;margin:0 2px!important;"},
		)
		out.WriteString(token.String())
	}
	return out.String()
}
