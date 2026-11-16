package template

import (
	"github.com/artalkjs/artalk/v2/internal/utils"
	"strings"
	"testing"
)

func TestEmailEmoticonsSurviveMissingStylesheet(t *testing.T) {
	source := `hello <img src="https://example.com/emoji.png" atk-emoticon="微笑" width="200" height="200"> <img src="https://example.com/photo.png" width="180" height="120">`
	// Use Artalk's real Markdown sanitizer, then render the actual mail template.
	marked, err := utils.Marked(source)
	if err != nil {
		t.Fatal(err)
	}
	renderer := NewEmailRenderer()
	body := renderer.Render(`<style>.mail img[atk-emoticon]{height:2em}</style><div>{{reply_content}}</div>`, tplParams{ReplyContent: marked}, nil, notifyExtraData{})
	// Simulate a mail client stripping the stylesheet: attributes must stand alone.
	body = body[strings.Index(body, "</style>")+8:]
	if !strings.Contains(body, `height="32"`) || !strings.Contains(body, `height:32px!important`) || !strings.Contains(body, `width:auto!important`) {
		t.Fatal(body)
	}
	if !strings.Contains(body, `<img src="https://example.com/photo.png" width="180" height="120"`) {
		t.Fatal("ordinary image modified:", body)
	}
	if strings.Contains(body, `height="200"`) || strings.Contains(body, `width="200"`) {
		t.Fatal(body)
	}
}

func TestEmailEmoticonsPreserveRawMarkupAndRecognizeClass(t *testing.T) {
	source := `<!--[if mso]>hello<![endif]--><a href="https://example.com/?a=1&amp;b=2">link</a><img class="atk-emoticon" src="wide.png" style="width:300px">`
	result := inlineEmailEmoticons(source)
	if !strings.HasPrefix(result, source[:strings.Index(source, "<img")]) || !strings.Contains(result, `height="32"`) {
		t.Fatal(result)
	}
	if inlineEmailEmoticons(result) != result {
		t.Fatal("normalization is not idempotent")
	}
}
