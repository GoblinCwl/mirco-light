package community

import (
	"context"
	"errors"
	"time"
)

// InitializeFeed fills a missing article timestamp after the friend is committed.
func (s Store) InitializeFeed(ctx context.Context, id string) error {
	friend, err := s.friendByID(ctx, id)
	if err != nil {
		return err
	}
	if friend.RSSURL == "" || friend.LatestUpdate != "" || friend.HealthFailures > 0 || friend.Status == "已失效" {
		return nil
	}
	read := s.ReadFeed
	if read == nil {
		read = func(ctx context.Context, source string) (time.Time, error) { return LatestFeedDate(ctx, source, nil) }
	}
	own, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	stamp, err := read(own, friend.RSSURL)
	if err != nil {
		return err
	}
	if stamp.IsZero() {
		return errors.New("RSS 没有有效文章时间")
	}
	_, err = s.DB.ExecContext(own, "UPDATE friends SET latest_update=? WHERE id=? AND rss_url=? AND latest_update='' AND health_failures=0 AND status<>'已失效'", stamp.UTC().Format("2006-01-02T15:04:05.000Z"), friend.ID, friend.RSSURL)
	return err
}
