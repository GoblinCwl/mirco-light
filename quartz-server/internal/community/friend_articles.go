package community

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"strings"
	"time"
)

const FriendArticleLimit = 20

const friendFeedTime = "2006-01-02T15:04:05.000Z"

type FriendArticle struct {
	Title        string    `json:"title"`
	URL          string    `json:"url"`
	PublishedAt  time.Time `json:"publishedAt"`
	Cover        string    `json:"cover,omitempty"`
	Source       string    `json:"source"`
	SourceAvatar string    `json:"sourceAvatar,omitempty"`
	FeedURL      string    `json:"-"`
	GUID         string    `json:"-"`
	entryID      string
}

func (s Store) saveFriendFeed(ctx context.Context, friend Friend, feed feedSnapshot) (bool, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var source, latest, status string
	var failures int
	err = tx.QueryRowContext(ctx, `SELECT rss_url,latest_update,status,health_failures FROM friends WHERE id=? FOR UPDATE`, friend.ID).
		Scan(&source, &latest, &status, &failures)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if source != friend.RSSURL || latest != friend.LatestUpdate || status != friend.Status || status == "已失效" || failures > 0 {
		return false, nil
	}
	stamp := feed.latest.UTC().Format(friendFeedTime)
	if stamp != latest {
		if _, err := tx.ExecContext(ctx, `UPDATE friends SET latest_update=? WHERE id=?`, stamp, friend.ID); err != nil {
			return false, err
		}
	}
	if len(feed.articles) > 0 {
		keys := []any{friend.ID}
		placeholders := make([]string, 0, len(feed.articles))
		for _, article := range feed.articles {
			key := sha256.Sum256([]byte(article.entryID))
			keys = append(keys, key[:])
			placeholders = append(placeholders, "?")
			if _, err := tx.ExecContext(ctx, `INSERT INTO friend_articles(friend_id,url_hash,title,url,published_at,cover,guid) VALUES(?,?,?,?,?,?,?) AS refreshed
				ON DUPLICATE KEY UPDATE guid=COALESCE(NULLIF(friend_articles.guid,''),friend_articles.url),
				title=refreshed.title,url=refreshed.url,published_at=refreshed.published_at,cover=refreshed.cover`,
				friend.ID, key[:], article.Title, article.URL, article.PublishedAt.UTC().Format(friendFeedTime), article.Cover, article.URL); err != nil {
				return false, err
			}
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM friend_articles WHERE friend_id=? AND url_hash NOT IN (`+strings.Join(placeholders, ",")+`)`, keys...); err != nil {
			return false, err
		}
	}
	return stamp != latest, tx.Commit()
}

func (s Store) refreshFriendFeed(ctx context.Context, friend Friend) (bool, error) {
	feed, err := s.readFriendFeed(ctx, friend.RSSURL)
	if err != nil {
		return false, err
	}
	return s.saveFriendFeed(ctx, friend, feed)
}

func (s Store) RecentFriendArticles(ctx context.Context, limit int) ([]FriendArticle, error) {
	return s.FriendArticlePage(ctx, min(limit, FriendArticleLimit), 0)
}

func (s Store) FriendArticlePage(ctx context.Context, limit, offset int) ([]FriendArticle, error) {
	rows, err := s.DB.QueryContext(ctx, `SELECT a.title,a.url,a.published_at,a.cover,f.name,f.avatar,f.rss_url,COALESCE(NULLIF(a.guid,''),a.url)
		FROM friend_articles a JOIN friends f ON f.id=a.friend_id
		WHERE f.status='展示中' AND f.example=0
		ORDER BY a.published_at DESC,a.friend_id,a.url_hash LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	articles := []FriendArticle{}
	for rows.Next() {
		var article FriendArticle
		var stamp string
		if err := rows.Scan(&article.Title, &article.URL, &stamp, &article.Cover, &article.Source, &article.SourceAvatar, &article.FeedURL, &article.GUID); err != nil {
			return nil, err
		}
		article.PublishedAt, err = time.Parse(friendFeedTime, stamp)
		if err != nil {
			return nil, err
		}
		articles = append(articles, article)
	}
	return articles, rows.Err()
}
