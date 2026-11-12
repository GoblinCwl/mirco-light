package community

import (
	"context"
	"database/sql"
	"errors"
	"goblincwl/quartz-server/internal/friendavatar"
	"goblincwl/quartz-server/internal/taskconfig"
	"strings"
	"time"
)

type FriendJob struct {
	FriendID   string
	Generation int64
	Attempts   int
}

// EnqueueFriendTx commits the work item together with its friend record.
func EnqueueFriendTx(ctx context.Context, tx *sql.Tx, id string) error {
	stamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := tx.ExecContext(ctx, "INSERT INTO friend_jobs(friend_id,generation,state,attempts,available_at,last_error,enqueued_at) VALUES(?,1,'pending',0,0,'',?) ON DUPLICATE KEY UPDATE generation=generation+1,state='pending',attempts=0,available_at=0,last_error='',enqueued_at=?", id, stamp, stamp)
	return err
}
func (s Store) EnqueueFriend(ctx context.Context, id string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var parent string
	if err := tx.QueryRowContext(ctx, "SELECT id FROM friends WHERE id=? FOR SHARE", id).Scan(&parent); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrFriendNotFound
		}
		return err
	}
	if err := EnqueueFriendTx(ctx, tx, id); err != nil {
		return err
	}
	return tx.Commit()
}
func (s Store) RecoverFriendJobs(ctx context.Context) error {
	if _, err := s.DB.ExecContext(ctx, "UPDATE friend_jobs SET state='pending',available_at=0"); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, "INSERT INTO friend_jobs(friend_id,generation,state,attempts,available_at,last_error,enqueued_at) SELECT id,1,'pending',0,0,'',? FROM friends WHERE status<>'已失效' AND (status='待审核' OR avatar LIKE 'https://%' OR avatar LIKE 'http://%' OR (rss_url<>'' AND latest_update='' AND health_failures=0)) ON DUPLICATE KEY UPDATE friend_id=friend_jobs.friend_id", time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
	return err
}
func (s Store) ClaimFriendJob(ctx context.Context, now time.Time) (*FriendJob, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var job FriendJob
	err = tx.QueryRowContext(ctx, "SELECT friend_id,generation,attempts FROM friend_jobs WHERE state='pending' AND available_at<=? ORDER BY available_at,enqueued_at,friend_id LIMIT 1 FOR UPDATE SKIP LOCKED", now.UnixMilli()).Scan(&job.FriendID, &job.Generation, &job.Attempts)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.ExecContext(ctx, "UPDATE friend_jobs SET state='running' WHERE friend_id=? AND generation=?", job.FriendID, job.Generation); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return &job, nil
}
func (s Store) NextFriendJob(ctx context.Context) (time.Time, error) {
	var due sql.NullInt64
	if err := s.DB.QueryRowContext(ctx, "SELECT min(available_at) FROM friend_jobs WHERE state='pending'").Scan(&due); err != nil {
		return time.Time{}, err
	}
	if !due.Valid {
		return time.Time{}, nil
	}
	return time.UnixMilli(due.Int64), nil
}
func FriendJobBackoff(attempt int) time.Duration {
	return min(time.Minute*time.Duration(1<<min(max(attempt-1, 0), 6)), time.Hour)
}
func (s Store) FinishFriendJob(ctx context.Context, job FriendJob, workErr error) error {
	if workErr == nil {
		_, err := s.DB.ExecContext(ctx, "DELETE FROM friend_jobs WHERE friend_id=? AND generation=?", job.FriendID, job.Generation)
		return err
	}
	message := []rune(workErr.Error())
	if len(message) > 1000 {
		message = message[:1000]
	}
	base := taskconfig.Duration(ctx, "friend-retry")
	delay := min(base*time.Duration(1<<min(max(job.Attempts, 0), 17)), taskconfig.Duration(ctx, "friend-retry-max"))
	due := time.Now().Add(delay).UnixMilli()
	_, err := s.DB.ExecContext(ctx, "UPDATE friend_jobs SET state='pending',attempts=attempts+1,available_at=?,last_error=? WHERE friend_id=? AND generation=?", due, string(message), job.FriendID, job.Generation)
	return err
}

// ProcessFriendJob performs remote work only in the background worker.
func (s Store) ProcessFriendJob(ctx context.Context, id string) error {
	friend, err := s.friendByID(ctx, id)
	if errors.Is(err, ErrFriendNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if friend.Status == "已失效" {
		return nil
	}
	var failures []error
	source := friend.Avatar
	if friendavatar.Local(source) || strings.HasPrefix(source, "/static/") || source == "" {
		source = friend.AvatarSource
	}
	if source != "" && !friendavatar.Local(source) && !strings.HasPrefix(source, "/static/") {
		if s.StoreAvatar == nil {
			failures = append(failures, errors.New("头像存储尚未配置"))
		} else {
			address, err := s.StoreAvatar(ctx, source)
			if err == nil {
				_, err = s.DB.ExecContext(ctx, "UPDATE friends SET avatar=? WHERE id=? AND avatar=? AND avatar_source=?", address, friend.ID, friend.Avatar, friend.AvatarSource)
			}
			if err != nil {
				failures = append(failures, err)
			}
		}
	}
	if err := s.InitializeFeed(ctx, id); err != nil {
		failures = append(failures, err)
	}
	if s.CheckBacklink != nil {
		if _, err := s.AutoReviewFriend(ctx, id); err != nil && !errors.Is(err, ErrFriendNotFound) {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}
