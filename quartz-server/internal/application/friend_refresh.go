package application

import (
	"context"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"time"
)

func (r *Runtime) dailyFriends() {
	retry := r.app.TaskRuns.RetrySignal("friends-refresh")
	r.goTask(func(root context.Context) {
		ticker := taskconfig.NewTicker(root, "friends-refresh")
		defer ticker.Stop()
		for {
			select {
			case <-root.Done():
				return
			case <-retry:
			case <-ticker.C:
			}
			ctx, cancel := context.WithTimeout(root, 30*time.Minute)
			err := taskruns.Run(ctx, "friends-refresh", func(ctx context.Context) error {
				pending, queueErr := (community.Store{DB: r.app.DB}).Friends(ctx, false)
				if queueErr == nil {
					for _, friend := range pending {
						if friend.Status != "已失效" {
							if err := (community.Store{DB: r.app.DB}).EnqueueFriend(ctx, friend.ID); err != nil {
								queueErr = err
							}
						}
					}
				}
				r.requestFriendJobs()
				taskruns.Note(ctx, "已将友链加入周期处理队列；失败仅累计次数，等待下个周期继续。")
				return queueErr

			})
			cancel()
			if root.Err() != nil {
				return
			}
			r.app.Log.Info("friend periodic processing queued", "failed", err != nil)
			if err != nil {
				r.app.Log.Warn("friend refresh retained stale data", "error", err)
			}
		}
	})
}
