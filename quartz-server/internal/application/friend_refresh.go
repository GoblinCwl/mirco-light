package application

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/publicfetch"
	"goblincwl/quartz-server/internal/taskconfig"
	"time"
)

var friendTimezone = time.FixedZone("Asia/Shanghai", 8*60*60)

func nextFriendRefresh(now time.Time) time.Time {
	return nextFriendRefreshAt(now, "06:00")
}
func nextFriendRefreshAt(now time.Time, clock string) time.Time {
	return nextFriendRefreshSchedule(now, clock, 1)
}
func nextFriendRefreshSchedule(now time.Time, clock string, days int) time.Time {
	parsed, _ := time.Parse("15:04", clock)
	local := now.In(friendTimezone)
	next := time.Date(local.Year(), local.Month(), local.Day(), parsed.Hour(), parsed.Minute(), 0, 0, friendTimezone)
	if !next.After(local) {
		next = next.AddDate(0, 0, 1)
	}
	if days > 1 {
		anchor := time.Date(1970, 1, 1, 0, 0, 0, 0, friendTimezone)
		day := int(time.Date(next.Year(), next.Month(), next.Day(), 0, 0, 0, 0, friendTimezone).Sub(anchor) / (24 * time.Hour))
		if remainder := day % days; remainder != 0 {
			next = next.AddDate(0, 0, days-remainder)
		}
	}
	return next
}
func (r *Runtime) dailyFriends() {
	r.goTask(func(root context.Context) {
		changed, stop := taskconfig.Watch(root, "tasks.friendsTime", "tasks.friendsEveryDays")
		defer stop()
		for {
			next := nextFriendRefreshSchedule(time.Now(), taskconfig.From(root).Clock(), taskconfig.From(root).FriendDays())
			r.app.Log.Info("next friend refresh scheduled", "at", next.Format(time.RFC3339))
			timer := time.NewTimer(time.Until(next))
			select {
			case <-root.Done():
				timer.Stop()
				return
			case <-changed:
				timer.Stop()
				continue
			case <-timer.C:
			}
			ctx, cancel := context.WithTimeout(root, 30*time.Minute)
			pending, queueErr := (community.Store{DB: r.app.DB}).Friends(ctx, false)
			if queueErr == nil {
				for _, friend := range pending {
					if friend.Status == "待审核" {
						if err := (community.Store{DB: r.app.DB}).EnqueueFriend(ctx, friend.ID); err != nil {
							queueErr = err
						}
					}
				}
			}
			r.requestFriendJobs()
			result, err := (community.Store{DB: r.app.DB, StoreAvatar: r.app.FriendAvatars.Save, CheckHomepage: func(ctx context.Context, address string) error { return publicfetch.Probe(ctx, address, nil) }}).RefreshLinks(ctx)
			err = errors.Join(queueErr, err)
			cancel()
			if root.Err() != nil {
				return
			}
			r.app.Log.Info("friend refresh finished", "avatars", result.Avatars, "feeds", result.Feeds, "approved", result.Approved, "failed", err != nil)
			if err != nil {
				r.app.Log.Warn("friend refresh retained stale data", "error", err)
				alerts.Emit(alerts.Event{Kind: "task", Level: "warning", Source: "友链更新", Title: "部分友链首页、审核、头像或 RSS 检查失败", Message: "首页不可用的友链已清空更新时间并进入每日重试；其他检查失败保留旧值，请检查对应地址与 OpenList 接入"})
			}
		}
	})
}
