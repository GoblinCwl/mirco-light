package application

import (
	"context"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/community"
	"goblincwl/quartz-server/internal/publicfetch"
	"goblincwl/quartz-server/internal/taskconfig"
	"goblincwl/quartz-server/internal/taskruns"
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
				taskruns.Note(ctx, "人工通过后巡检，跳过自动审核")
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
			if !r.recoverFriendQueue(root, store) {
				return
			}
			continue
		}
		if workErr != nil && job.InspectOnly {
			r.app.Log.Warn("friend inspection completed with issues; removed from review queue", "friend", job.FriendID, "error", workErr)
			alerts.Emit(alerts.Event{Kind: "task", Level: "warning", Source: "友链巡检", Title: "人工审核后的友链巡检部分失败", Message: "已保留人工审核结果并移除本次队列任务；失败项由日常巡检跟进，请检查头像、RSS、首页及 OpenList 接入"})
		} else if workErr != nil {
			r.app.Log.Warn("friend background job failed; retry scheduled", "friend", job.FriendID, "attempt", job.Attempts+1, "error", workErr)
			alerts.Emit(alerts.Event{Kind: "task", Level: "warning", Source: "友链队列", Title: "友链后台处理失败", Message: "申请已保存，任务保留并将自动重试；请检查头像、RSS、友链页面及 OpenList 接入"})
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
