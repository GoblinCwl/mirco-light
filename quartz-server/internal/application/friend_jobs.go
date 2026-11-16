package application

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/publicfetch"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
	"strings"
	"time"
)

func (r *Runtime) requestFriendJobs() {
	select {
	case r.friendJobsWake <- struct{}{}:
	default:
	}
}
func (r *Runtime) waitFriendJobs(ctx context.Context, due time.Time) bool {
	changed, stop := taskconfig.Watch(ctx, taskconfig.Key("friend-recovery"))
	defer stop()
	if due.IsZero() {
		select {
		case <-changed:
			return true
		case <-ctx.Done():
			return false
		case <-r.friendJobsWake:
			return true
		}
	}
	delay := max(time.Until(due), time.Millisecond)
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-changed:
		return true
	case <-ctx.Done():
		return false
	case <-r.friendJobsWake:
		return true
	case <-timer.C:
		return true
	}
}
func (r *Runtime) runFriendJobs(root context.Context) {
	store := community.Store{DB: r.app.DB, StoreAvatar: r.app.FriendAvatars.Save, CheckHomepage: func(ctx context.Context, address string) error { return publicfetch.Probe(ctx, address, nil) }, CheckBacklink: func(ctx context.Context, f community.Friend) (community.BacklinkResult, error) {
		return community.CheckBacklink(ctx, f, r.app.Origin, nil)
	}}
	r.app.TaskRuns.RegisterRetry("friend-recovery", func(context.Context) error { r.requestFriendJobs(); return nil })
	r.app.TaskRuns.RegisterRetry("friend-jobs", func(ctx context.Context) error {
		var logs string
		if err := r.app.DB.QueryRowContext(ctx, "SELECT logs FROM task_runs WHERE task_key='friend-jobs' ORDER BY id DESC LIMIT 1").Scan(&logs); err != nil {
			return err
		}
		friends, err := store.Friends(ctx, false)
		if err != nil {
			return err
		}
		for _, friend := range friends {
			if strings.Contains(logs, "（"+friend.ID+"）") {
				if err := store.EnqueueFriend(ctx, friend.ID); err != nil {
					return err
				}
				r.requestFriendJobs()
				return nil
			}
		}
		return errors.New("原友链已不存在，无法重试")
	})
	r.app.TaskRuns.RegisterTrigger("friend-jobs", func(ctx context.Context) error {
		if _, err := store.EnqueuePendingFriendReviews(ctx); err != nil {
			return err
		}
		var waiting int
		if err := r.app.DB.QueryRowContext(ctx, "SELECT count(*) FROM friend_jobs WHERE state='pending'").Scan(&waiting); err != nil {
			return err
		}
		if waiting == 0 {
			return errors.New("当前没有待处理的友链；全站巡检请执行友链巡检任务")
		}
		r.requestFriendJobs()
		return nil
	})

	if !r.recoverFriendQueue(root, store) {
		return
	}
	r.app.Log.Info("friend queue recovered; processing pending jobs")
	for root.Err() == nil {
		job, err := store.ClaimFriendJob(root, time.Now())
		if err != nil {
			r.app.Log.Warn("friend queue claim failed; retrying")
			if !r.waitFriendJobs(root, time.Now().Add(taskconfig.Duration(root, "friend-recovery"))) {
				return
			}
			continue
		}
		if job == nil {
			due, err := store.NextFriendJob(root)
			if err != nil {
				due = time.Now().Add(taskconfig.Duration(root, "friend-recovery"))
			}
			if !r.waitFriendJobs(root, due) {
				return
			}
			continue
		}
		ctx, cancel := context.WithTimeout(root, 3*time.Minute)
		workErr := taskruns.Run(ctx, "friend-jobs", func(ctx context.Context) error {
			taskruns.Note(ctx, "友链："+job.FriendName+"（"+job.FriendID+"）")
			if job.InspectOnly {
				taskruns.Note(ctx, "已通过审核，仅巡检首页、头像和 RSS")
			}
			return store.ProcessClaimedFriendJob(ctx, *job)
		})
		cancel()
		if root.Err() != nil {
			return
		} // Leave running work persisted for recovery on the next start.
		if err := store.FinishFriendJob(root, *job, workErr); err != nil {
			r.app.Log.Warn("friend queue completion failed; recovering")
			if !r.waitFriendJobs(root, time.Now().Add(taskconfig.Duration(root, "friend-recovery"))) {
				return
			}
			r.app.TaskRuns.RegisterRetry("friend-recovery", func(context.Context) error { r.requestFriendJobs(); return nil })
			r.app.TaskRuns.RegisterRetry("friend-jobs", func(ctx context.Context) error {
				var logs string
				if err := r.app.DB.QueryRowContext(ctx, "SELECT logs FROM task_runs WHERE task_key='friend-jobs' ORDER BY id DESC LIMIT 1").Scan(&logs); err != nil {
					return err
				}
				friends, err := store.Friends(ctx, false)
				if err != nil {
					return err
				}
				for _, friend := range friends {
					if strings.Contains(logs, "（"+friend.ID+"）") {
						if err := store.EnqueueFriend(ctx, friend.ID); err != nil {
							return err
						}
						r.requestFriendJobs()
						return nil
					}
				}
				return errors.New("原友链已不存在，无法重试")
			})
			if !r.recoverFriendQueue(root, store) {
				return
			}
			continue
		}
		if workErr != nil {
			r.app.Log.Warn("friend processing failed; recorded for next periodic run", "friend", job.FriendID)
		} else {
			r.app.Log.Info("friend background job completed", "friend", job.FriendID)
		}
	}
}

func (r *Runtime) recoverFriendQueue(root context.Context, store community.Store) bool {
	for root.Err() == nil {
		if err := taskruns.Run(root, "friend-recovery", store.RecoverFriendJobs); err == nil {
			return true
		}
		r.app.Log.Warn("friend queue recovery failed; retrying")
		if !r.waitFriendJobs(root, time.Now().Add(taskconfig.Duration(root, "friend-recovery"))) {
			return false
		}
	}
	return false
}
