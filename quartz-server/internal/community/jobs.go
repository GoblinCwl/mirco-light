package community

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/friendavatar"
	"goblincwl/quartz-server/internal/taskruns"
	"strings"
	"time"
)

type FriendJob struct {
	FriendID       string
	FriendName     string
	Generation     int64
	Attempts       int
	ManualApproval bool
	InspectOnly    bool
}

// EnqueueFriendTx commits the work item together with its friend record.
func EnqueueFriendTx(ctx context.Context, tx *sql.Tx, id string) error {
	if _, err := tx.ExecContext(ctx, "UPDATE friends SET review_ready=0 WHERE id=? AND status='待审核'", id); err != nil {
		return err
	}
	stamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	_, err := tx.ExecContext(ctx, "INSERT INTO friend_jobs(friend_id,generation,state,attempts,available_at,last_error,enqueued_at) VALUES(?,1,'pending',0,0,'',?) ON DUPLICATE KEY UPDATE generation=generation+1,state='pending',attempts=0,available_at=0,last_error='',manual_approval=0,enqueued_at=?", id, stamp, stamp)
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
	return nil
}
func (s Store) ClaimFriendJob(ctx context.Context, now time.Time) (*FriendJob, error) {
	return s.ClaimFriendJobExcept(ctx, now, nil)
}

// ClaimFriendJobExcept excludes friends already running in this worker pool, including newer generations.
func (s Store) ClaimFriendJobExcept(ctx context.Context, now time.Time, active []string) (*FriendJob, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var job FriendJob
	query := "SELECT j.friend_id,f.name,j.generation,j.attempts,(f.status='展示中'),j.manual_approval FROM friend_jobs j JOIN friends f ON f.id=j.friend_id WHERE j.state='pending' AND j.available_at<=?"
	args := []any{now.UnixMilli()}
	if len(active) > 0 {
		placeholders := make([]string, len(active))
		for i, id := range active {
			placeholders[i] = "?"
			args = append(args, id)
		}
		query += " AND j.friend_id NOT IN (" + strings.Join(placeholders, ",") + ")"
	}
	query += " ORDER BY j.available_at,j.enqueued_at,j.friend_id LIMIT 1 FOR UPDATE SKIP LOCKED"
	err = tx.QueryRowContext(ctx, query, args...).Scan(&job.FriendID, &job.FriendName, &job.Generation, &job.Attempts, &job.InspectOnly, &job.ManualApproval)
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
func (s Store) FinishFriendJob(ctx context.Context, job FriendJob, workErr error) error {
	tx, err := s.transaction(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err = tx.QueryRowContext(ctx, "SELECT status FROM friends WHERE id=? FOR UPDATE", job.FriendID).Scan(&status); errors.Is(err, sql.ErrNoRows) {
		return nil
	} else if err != nil {
		return err
	}
	var generation int64
	if err = tx.QueryRowContext(ctx, "SELECT generation FROM friend_jobs WHERE friend_id=? FOR UPDATE", job.FriendID).Scan(&generation); errors.Is(err, sql.ErrNoRows) {
		return nil
	} else if err != nil {
		return err
	}
	if generation != job.Generation {
		return nil
	}
	if workErr != nil || (status == "待审核" && !job.InspectOnly) {
		if status == "展示中" {
			if errors.Is(workErr, ErrHomepageInspectionFailed) {
				if err = recordInspectionFailureTx(ctx, tx, job.FriendID, workErr); err != nil {
					return err
				}
			}
		} else if err = recordFriendFailureTx(ctx, tx, job.FriendID, workErr); err != nil {
			return err
		}
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM friend_jobs WHERE friend_id=? AND generation=?", job.FriendID, job.Generation); err != nil {
		return err
	}
	return tx.Commit()
}

// ProcessClaimedFriendJob retains the claimed task mode across concurrent admin edits.
func (s Store) ProcessClaimedFriendJob(ctx context.Context, job FriendJob) error {
	if job.InspectOnly {
		return s.InspectFriend(ctx, job.FriendID)
	}
	return s.processFriendJob(ctx, job.FriendID, job.ManualApproval)
}

// ProcessFriendJob performs remote work only in the background worker.
func (s Store) ProcessFriendJob(ctx context.Context, id string) error {
	return s.processFriendJob(ctx, id, false)
}
func (s Store) processFriendJob(ctx context.Context, id string, manualApproval bool) error {
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
	if friend.Status == "展示中" {
		return s.InspectFriend(ctx, id)
	}
	if _, err = s.DB.ExecContext(ctx, "UPDATE friends SET review_ready=0 WHERE id=? AND status='待审核'", id); err != nil {
		return err
	}
	var failures []error
	if s.CheckHomepage == nil {
		failures = append(failures, errors.New("首页检查尚未配置"))
	} else {
		own, cancel := context.WithTimeout(ctx, 25*time.Second)
		taskruns.Note(ctx, "检查首页："+friend.Name)
		if err = s.CheckHomepage(own, friend.URL); err != nil {
			failures = append(failures, fmt.Errorf("首页检查失败：%w", err))
		}
		cancel()
	}
	expectedAvatar := friend.Avatar
	source := friend.Avatar
	if friendavatar.Local(source) || strings.HasPrefix(source, "/static/") || source == "" {
		source = friend.AvatarSource
	}
	if source != "" && !friendavatar.Local(source) && !strings.HasPrefix(source, "/static/") {
		if s.StoreAvatar == nil {
			failures = append(failures, errors.New("头像存储尚未配置"))
		} else {
			taskruns.Note(ctx, "存储头像："+friend.Name)
			address, err := s.StoreAvatar(ctx, source)
			if err == nil {
				_, err = s.DB.ExecContext(ctx, "UPDATE friends SET avatar=? WHERE id=? AND avatar=? AND avatar_source=?", address, friend.ID, friend.Avatar, friend.AvatarSource)
				if err == nil {
					expectedAvatar = address
				}
			}
			if err != nil {
				failures = append(failures, err)
			}
		}
	}
	if friend.RSSURL != "" {
		taskruns.Note(ctx, "初始化 RSS："+friend.Name)
	}
	if friend.RSSURL != "" {
		own, cancel := context.WithTimeout(ctx, 30*time.Second)
		read := s.ReadFeed
		if read == nil {
			read = func(ctx context.Context, address string) (time.Time, error) { return LatestFeedDate(ctx, address, nil) }
		}
		stamp, feedErr := read(own, friend.RSSURL)
		cancel()
		if feedErr == nil && stamp.IsZero() {
			feedErr = errors.New("RSS 没有有效文章时间")
		}
		if feedErr != nil {
			failures = append(failures, feedErr)
		} else {
			_, feedErr = s.DB.ExecContext(ctx, "UPDATE friends SET latest_update=? WHERE id=? AND rss_url=? AND status='待审核'", stamp.UTC().Format("2006-01-02T15:04:05.000Z"), id, friend.RSSURL)
			if feedErr != nil {
				failures = append(failures, feedErr)
			}
		}
	}

	if len(failures) > 0 {
		message := "预检查未通过：首页、RSS 或头像处理失败，请等待下个周期或手动重新检查"
		_, saveErr := s.DB.ExecContext(ctx, "UPDATE friends SET review_ready=0,review_result=? WHERE id=? AND status='待审核'", message, id)
		return errors.Join(append(failures, saveErr)...)
	}
	changed, saveErr := s.DB.ExecContext(ctx, "UPDATE friends SET review_ready=1 WHERE id=? AND status='待审核' AND url=? AND rss_url=? AND avatar_source=? AND avatar=?", id, friend.URL, friend.RSSURL, friend.AvatarSource, expectedAvatar)
	if saveErr != nil {
		return saveErr
	}
	n, _ := changed.RowsAffected()
	if n == 0 {
		return errors.New("友链信息已变化，等待新任务检查")
	}
	if manualApproval {
		return s.finishManualApproval(ctx, friend)
	}
	if s.CheckBacklink != nil {
		if friend.Status == "待审核" {
			taskruns.Note(ctx, "执行回链自动审核："+friend.Name)
		}
		if reviewed, err := s.AutoReviewFriend(ctx, id); err != nil && !errors.Is(err, ErrFriendNotFound) {
			failures = append(failures, err)
		} else if err == nil && reviewed.Status == "待审核" {
			failures = append(failures, errors.New("回链自动审核未通过"))
		}
	}
	return errors.Join(failures...)
}
