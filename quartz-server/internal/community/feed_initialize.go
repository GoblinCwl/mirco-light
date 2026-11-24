package community

import "context"

// InitializeFeed fills a missing article timestamp after the friend is committed.
func (s Store) InitializeFeed(ctx context.Context, id string) error {
	friend, err := s.friendByID(ctx, id)
	if err != nil {
		return err
	}
	if friend.RSSURL == "" || friend.LatestUpdate != "" || friend.HealthFailures > 0 || friend.Status == "已失效" {
		return nil
	}
	_, err = s.refreshFriendFeed(ctx, friend)
	return err
}
