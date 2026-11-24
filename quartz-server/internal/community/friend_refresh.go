package community

import (
	"context"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/taskruns"
	"time"
)

var ErrHomepageInspectionFailed = errors.New("首页巡检失败")

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
				taskruns.Note(ctx, fmt.Sprintf("%s 头像刷新失败，保留已有头像：%s", friend.Name, taskruns.Clean(err.Error(), 240)))
			}
		}
		if friend.RSSURL != "" {
			taskruns.Note(ctx, "刷新 RSS："+friend.Name)
			changed, err := s.refreshFriendFeed(ctx, friend)
			if err != nil {
				taskruns.Note(ctx, fmt.Sprintf("%s RSS 刷新失败，保留已有数据：%s", friend.Name, taskruns.Clean(err.Error(), 240)))
			} else if changed {
				result.Feeds++
			}
		}
	}
	return result, errors.Join(failures...)
}
