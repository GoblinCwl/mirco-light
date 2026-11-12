package community

import (
	"bytes"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
	"golang.org/x/net/html"
	"net/url"
	"strings"
)

// Recognize raw Markdown in designated render containers, not arbitrary page text.
func markdownSource(n *html.Node) ([]byte, bool) {
	if n.Type != html.ElementNode {
		return nil, false
	}
	switch n.Data {
	case "article", "div", "section", "p", "main":
	default:
		return nil, false
	}
	marked := false
	for _, class := range strings.Fields(attr(n, "class")) {
		switch class {
		case "markdown-article", "markdown-body", "markdown-content", "markdown-source":
			marked = true
		}
	}
	for _, a := range n.Attr {
		if a.Key == "data-markdown" {
			marked = true
		}
	}
	if !marked {
		return nil, false
	}
	var content bytes.Buffer
	for child := n.FirstChild; child != nil; child = child.NextSibling {
		switch child.Type {
		case html.TextNode:
			content.WriteString(child.Data)
		case html.CommentNode:
			continue
		case html.ElementNode:
			if child.Data != "br" {
				return nil, false
			}
			content.WriteByte('\n')
		default:
			return nil, false
		}
	}
	return content.Bytes(), true
}
func markdownBacklink(source []byte, base, site *url.URL, allowLinkCards bool) bool {
	document := goldmark.New().Parser().Parse(text.NewReader(source))
	found := false
	_ = ast.Walk(document, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		var destination []byte
		switch node := n.(type) {
		case *ast.Image:
			return ast.WalkSkipChildren, nil
		case *ast.Link:
			destination = node.Destination
		case *ast.AutoLink:
			destination = node.URL(source)
		case *ast.FencedCodeBlock:
			// The links language is a rendered friend-card format, not an example code block.
			if allowLinkCards && string(node.Language(source)) == "links" && markdownBacklink(node.Lines().Value(source), base, site, false) {
				found = true
				return ast.WalkStop, nil
			}
		}
		if len(destination) > 0 {
			target, err := url.Parse(strings.TrimSpace(html.UnescapeString(string(destination))))
			if err == nil && homepageLink(base.ResolveReference(target), site) {
				found = true
				return ast.WalkStop, nil
			}
		}
		return ast.WalkContinue, nil
	})
	return found
}
