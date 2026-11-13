package community

import (
	"context"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/taskruns"
	"time"
)

type RefreshResult struct{ Avatars, Feeds, Approved int }

// RefreshLinks checks the two resources independently, retaining prior data on error.
func (s Store) RefreshLinks(ctx context.Context) (RefreshResult, error) {
	friends, err := s.Friends(ctx, false)
	if err != nil {
		return RefreshResult{}, err
	}
	return s.refreshFriends(ctx, friends)
}

// InspectFriend runs the regular health/avatar/RSS inspection once, never backlink review.
func (s Store) InspectFriend(ctx context.Context, id string) error {
	friend, err := s.friendByID(ctx, id)
	if errors.Is(err, ErrFriendNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if friend.Status != "展示中" {
		return nil
	}
	s.CheckBacklink = nil
	_, err = s.refreshFriends(ctx, []Friend{friend})
	return err
}

func (s Store) refreshFriends(ctx context.Context, friends []Friend) (RefreshResult, error) {
	var result RefreshResult
	var failures []error
	for _, friend := range friends {
		if ctx.Err() != nil {
			return result, errors.Join(append(failures, ctx.Err())...)
		}
		if friend.Status == "待审核" && s.CheckBacklink == nil {
			continue
		}
		if friend.Status == "待审核" && s.CheckBacklink != nil {
			reviewed, err := s.autoReviewSnapshot(ctx, friend)
			if err != nil {
				failures = append(failures, fmt.Errorf("%s 自动审核失败: %w", friend.Name, err))
			} else if reviewed.Status == "展示中" {
				result.Approved++
				friend = reviewed
			}
		}
		if friend.Status == "已失效" {
			continue
		}
		if friend.Status == "展示中" && s.CheckHomepage != nil {
			taskruns.Note(ctx, "检查首页："+friend.Name)
			checked, available, err := s.checkHomepageSnapshot(ctx, friend, time.Now())
			if err != nil {
				failures = append(failures, fmt.Errorf("%s 首页检查失败: %w", friend.Name, err))
			}
			friend = checked
			if !available {
				continue
			}
		}
		if friend.AvatarSource != "" {
			taskruns.Note(ctx, "刷新头像："+friend.Name)
			own, cancel := context.WithTimeout(ctx, 60*time.Second)
			var address string
			var err error
			if s.StoreAvatar == nil {
				err = errors.New("头像存储尚未配置")
			} else {
				address, err = s.StoreAvatar(own, friend.AvatarSource)
			}
			cancel()
			if err == nil && address != friend.Avatar {
				mutation, e := s.DB.ExecContext(ctx, "UPDATE friends SET avatar=? WHERE id=? AND avatar=? AND avatar_source=?", address, friend.ID, friend.Avatar, friend.AvatarSource)
				err = e
				if e == nil {
					count, e := mutation.RowsAffected()
					err = e
					result.Avatars += int(count)
				}
			}
			if err != nil {
				failures = append(failures, fmt.Errorf("%s 头像刷新失败: %w", friend.Name, err))
			}
		}
		if friend.RSSURL != "" {
			taskruns.Note(ctx, "刷新 RSS："+friend.Name)
			own, cancel := context.WithTimeout(ctx, 30*time.Second)
			read := s.ReadFeed
			if read == nil {
				read = func(ctx context.Context, address string) (time.Time, error) { return LatestFeedDate(ctx, address, nil) }
			}
			stamp, err := read(own, friend.RSSURL)
			cancel()
			if err == nil && stamp.IsZero() {
				err = errors.New("RSS 没有有效文章时间")
			}
			if err == nil {
				latest := stamp.UTC().Format("2006-01-02T15:04:05.000Z")
				if latest != friend.LatestUpdate {
					mutation, e := s.DB.ExecContext(ctx, "UPDATE friends SET latest_update=? WHERE id=? AND rss_url=? AND latest_update=? AND health_failures=0 AND status<>'已失效'", latest, friend.ID, friend.RSSURL, friend.LatestUpdate)
					err = e
					if e == nil {
						count, e := mutation.RowsAffected()
						err = e
						result.Feeds += int(count)
					}
				}
			}
			if err != nil {
				failures = append(failures, fmt.Errorf("%s RSS 刷新失败: %w", friend.Name, err))
			}
		}
	}
	return result, errors.Join(failures...)
}
