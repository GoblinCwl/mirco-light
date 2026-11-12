package community

import (
	"context"
	"time"
)

// One persisted attempt per Beijing calendar day forms the seven-day retry queue.
func (s Store) checkHomepageSnapshot(ctx context.Context, friend Friend, now time.Time) (Friend, bool, error) {
	day := now.In(time.FixedZone("Asia/Shanghai", 8*3600)).Format("2006-01-02")
	if friend.Status != "展示中" || friend.HealthFailures >= 7 {
		return friend, false, nil
	}
	if friend.HealthCheckedOn == day {
		return friend, friend.HealthFailures == 0, nil
	}
	own, cancel := context.WithTimeout(ctx, 25*time.Second)
	checkErr := s.CheckHomepage(own, friend.URL)
	cancel()
	if ctx.Err() != nil {
		return friend, false, ctx.Err()
	}
	count := 0
	message := ""
	status := friend.Status
	if checkErr != nil {
		count = friend.HealthFailures + 1
		message = checkErr.Error()
		if count >= 7 {
			count = 7
			status = "已失效"
		}
	}
	if len([]rune(message)) > 255 {
		message = string([]rune(message)[:255])
	}
	_, err := s.DB.ExecContext(ctx, "UPDATE friends SET health_failures=?,health_checked_on=?,health_error=?,latest_update=CASE WHEN ?>0 THEN '' ELSE latest_update END,status=? WHERE id=? AND url=? AND status='展示中' AND health_failures=? AND health_checked_on=?", count, day, message, count, status, friend.ID, friend.URL, friend.HealthFailures, friend.HealthCheckedOn)
	if err != nil {
		return friend, false, err
	}
	current, err := s.friendByID(ctx, friend.ID)
	if err != nil {
		return friend, false, err
	}
	return current, current.Status == "展示中" && current.HealthFailures == 0 && current.HealthCheckedOn == day, checkErr
}
