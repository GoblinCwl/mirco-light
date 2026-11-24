package httpapi

import (
	"encoding/xml"
	"goblincwl/quartz-server/internal/community"
	"net/http"
	"strings"
	"time"
)

// The work item was already committed with the friend record; this is only a wake-up.
func (s *Server) wakeFriendJobs() {
	if s.FriendJobsChanged != nil {
		s.FriendJobsChanged()
	}
}

func (s *Server) friendRSS(w http.ResponseWriter, r *http.Request) {
	articles, err := (community.Store{DB: s.DB}).RecentFriendArticles(r.Context(), community.FriendArticleLimit)
	if err != nil {
		s.fail(w, err)
		return
	}
	type source struct {
		URL  string `xml:"url,attr"`
		Name string `xml:",chardata"`
	}
	type guid struct {
		IsPermaLink string `xml:"isPermaLink,attr"`
		Value       string `xml:",chardata"`
	}
	type item struct {
		Title   string `xml:"title"`
		Link    string `xml:"link"`
		GUID    guid   `xml:"guid"`
		PubDate string `xml:"pubDate"`
		Source  source `xml:"source"`
	}
	feed := struct {
		XMLName     xml.Name `xml:"rss"`
		Version     string   `xml:"version,attr"`
		Title       string   `xml:"channel>title"`
		Link        string   `xml:"channel>link"`
		Description string   `xml:"channel>description"`
		Items       []item   `xml:"channel>item"`
	}{Version: "2.0", Title: "微光集 · 友链动态", Link: strings.TrimRight(s.Origin, "/") + "/friends/", Description: "微光集收录的友链站点最新文章"}
	for _, article := range articles {
		feed.Items = append(feed.Items, item{
			Title: article.Title, Link: article.URL, GUID: guid{IsPermaLink: "false", Value: article.GUID},
			PubDate: article.PublishedAt.UTC().Format(time.RFC1123Z),
			Source:  source{URL: article.FeedURL, Name: article.Source},
		})
	}
	data, err := xml.Marshal(feed)
	if err != nil {
		s.fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/rss+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write([]byte(xml.Header))
	w.Write(data)
}
