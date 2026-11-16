package community

import (
	"context"
	"database/sql"
	"fmt"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/notifications"
	"goblincwl/quartz-server/internal/taskruns"
	"time"
)

func recordInspectionFailureTx(ctx context.Context, tx *sql.Tx, id string, workErr error) error {
	message := "巡检失败"
	if workErr != nil {
		message = taskruns.Clean(workErr.Error(), 240)
	}
	day := time.Now().In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
	if _, err := tx.ExecContext(ctx, "UPDATE friends SET inspection_failures=inspection_failures+IF(inspection_failed_on<>?,1,0),inspection_failed_on=?,processing_failures=processing_failures+1,health_error=? WHERE id=?", day, day, message, id); err != nil {
		return err
	}
	gray, remove := 3, 7
	for key, dst := range map[string]*int{"tasks.friendsGrayDays": &gray, "tasks.friendsRemoveDays": &remove} {
		var value int
		if err := tx.QueryRowContext(ctx, "SELECT CAST(JSON_UNQUOTE(value) AS UNSIGNED) FROM settings WHERE `key`=?", key).Scan(&value); err == nil && value >= 1 && value <= 365 {
			*dst = value
		}
	}
	var f Friend
	var count, limit int
	if err := tx.QueryRowContext(ctx, "SELECT id,name,url,email,inspection_failures,COALESCE((SELECT CAST(JSON_UNQUOTE(value) AS UNSIGNED) FROM settings WHERE `key`='friends.failureLimit'),5) FROM friends WHERE id=?", id).Scan(&f.ID, &f.Name, &f.URL, &f.Email, &count, &limit); err != nil {
		return err
	}
	if count >= remove {
		if f.Email != "" {
			if err := EnqueueInspectionRemovalMailTx(ctx, tx, f, count, message); err != nil {
				return err
			}
			if err := notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "friends", RecordID: id, Title: "友链巡检失败，已移除", Summary: fmt.Sprintf("%s 巡检累计失败 %d 天，已移除，邮件通知已加入发送队列。\n原因：%s", f.Name, count, message), Status: "已移除"}); err != nil {
				return err
			}
		} else {
			if err := alerts.RecordTx(ctx, tx, alerts.Event{Kind: "task", Level: "warning", Source: "友链巡检", Title: "友链已移除，无法发送邮件", Message: fmt.Sprintf("%s 巡检累计失败 %d 天，已移除；未提供通知邮箱，无法发送邮件。\n原因：%s", f.Name, count, message), Target: f.URL}, time.Now()); err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, "DELETE FROM friends WHERE id=?", id)
		return err
	}
	if count >= limit {
		return notifications.EnqueueTx(ctx, tx, notifications.Event{Kind: "friends", RecordID: id, Title: "友链巡检累计失败", Summary: fmt.Sprintf("%s 巡检累计失败 %d 天，累计%d天置灰、%d天自动移除并邮件通知；本次已跳过，其他友链继续处理。\n原因：%s", f.Name, count, gray, remove, message), Status: "巡检异常"})
	}
	return nil
}
