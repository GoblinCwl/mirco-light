package community

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestBacklinkRequiresRealHomepageAnchor(t *testing.T) {
	page, _ := url.Parse("https://applicant.example/friends/")
	site, _ := url.Parse("https://goblincwl.site")
	for _, body := range []string{
		`<a href="https://goblincwl.site/">微光集</a>`,
		`<a href="//goblincwl.site/?from=friends#home"><img src="a.png"></a>`,
		`<a href="https:&#47;&#47;goblincwl.site/">encoded</a>`,
		`<base href="https://goblincwl.site/"><a href="/">home</a>`,
	} {
		found, err := pageBacklink([]byte(body), "text/html; charset=utf-8", page, site)
		if err != nil || !found {
			t.Fatal("missed valid anchor", body, err)
		}
	}
	for _, body := range []string{
		`text https://goblincwl.site/`,
		`<!-- <a href="https://goblincwl.site/">comment</a> -->`,
		`<script>const html='<a href="https://goblincwl.site/">script</a>'</script>`,
		`<template><a href="https://goblincwl.site/">inert</a></template>`,
		`<div hidden><a href="https://goblincwl.site/">hidden</a></div>`,
		`<a href="https://goblincwl.site.evil.example/">spoof</a>`,
		`<a href="https://goblincwl.site@evil.example/">userinfo</a>`,
		`<a href="https://goblincwl.site/about/">another page</a>`,
		`<a href="/">applicant home</a>`,
		`<a href="javascript:location='https://goblincwl.site/'">script href</a>`,
	} {
		found, err := pageBacklink([]byte(body), "text/html", page, site)
		if err != nil || found {
			t.Fatal("accepted non-backlink", body, err)
		}
	}
}
func TestBacklinkFetchChecksApplicantAndFinalPage(t *testing.T) {
	const origin = "https://goblincwl.site"
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<a href="https://goblincwl.site/">site</a>`))
	}))
	defer other.Close()
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		switch r.URL.Path {
		case "/redirect":
			http.Redirect(w, r, other.URL+"/", http.StatusFound)
		case "/json":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"content":"<a href='https://goblincwl.site/'>site</a>"}`))
		case "/403":
			w.WriteHeader(403)
		default:
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(`<a href="https://goblincwl.site/">site</a>`))
		}
	}))
	defer server.Close()
	friend := Friend{URL: server.URL, BacklinkURL: server.URL + "/friends"}
	result, err := CheckBacklink(context.Background(), friend, origin, server.Client())
	if err != nil || !result.Found {
		t.Fatal(result, err)
	}
	for _, route := range []string{"/redirect", "/json"} {
		friend.BacklinkURL = server.URL + route
		result, err = CheckBacklink(context.Background(), friend, origin, server.Client())
		if err != nil || result.Found {
			t.Fatal(route, result, err)
		}
	}
	friend.BacklinkURL = server.URL + "/403"
	if _, err = CheckBacklink(context.Background(), friend, origin, server.Client()); err == nil {
		t.Fatal("HTTP failure ignored")
	}
	before := requests
	friend.BacklinkURL = other.URL
	result, err = CheckBacklink(context.Background(), friend, origin, server.Client())
	if err != nil || result.Found || requests != before {
		t.Fatal("unrelated proof accepted", result, err)
	}
	friend.URL = origin
	friend.BacklinkURL = origin + "/friends"
	result, err = CheckBacklink(context.Background(), friend, origin, server.Client())
	if err != nil || result.Found || !strings.Contains(result.Message, "本站页面") {
		t.Fatal("self-site proof accepted", result, err)
	}
	friend.URL = server.URL
	friend.BacklinkURL = server.URL
	if _, err = CheckBacklink(context.Background(), friend, origin, nil); err == nil {
		t.Fatal("public checker fetched loopback")
	}
}

func TestBacklinkRecognizesRenderedMarkdownAndFriendCards(t *testing.T) {
	page, _ := url.Parse("https://feiqi3.cn/links")
	site, _ := url.Parse("https://goblincwl.site")
	cards := "```links\n[微光集](https://goblincwl.site/) | https://goblincwl.site/avatar.png | 简介\n```"
	for _, body := range []string{
		`<p class="markdown-article line-numbers heti">` + cards + `</p>`,
		`<div data-markdown>[微光集](https://goblincwl.site/)</div>`,
		`<article class="markdown-source">[微光集][site]

[site]: https://goblincwl.site/</article>`,
	} {
		found, err := pageBacklink([]byte(body), "text/html; charset=utf-8", page, site)
		if err != nil || !found {
			t.Fatal("missed Markdown backlink", body, err)
		}
	}
	for _, body := range []string{
		`<p>[微光集](https://goblincwl.site/)</p>`,
		`<p class="markdown-article">文字 https://goblincwl.site/</p>`,
		`<div hidden><p class="markdown-article">` + cards + `</p></div>`,
		`<script>const source='[微光集](https://goblincwl.site/)'</script>`,
		`<pre class="markdown-body">[微光集](https://goblincwl.site/)</pre>`,
		`<div class="markdown-body">` + "```markdown\n[微光集](https://goblincwl.site/)\n```" + `</div>`,
		`<div class="markdown-body">![头像](https://goblincwl.site/)</div>`,
		`<div class="markdown-body">[假链接](https://goblincwl.site.evil.example/)</div>`,
	} {
		found, err := pageBacklink([]byte(body), "text/html", page, site)
		if err != nil || found {
			t.Fatal("accepted non-rendered Markdown", body, err)
		}
	}
}
