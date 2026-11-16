package notifications

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/settings"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func endpoint(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" && u.User == nil && u.Fragment == ""
}
func (s Store) Deliver(ctx context.Context, client *http.Client) (bool, error) {
	values, err := (settings.Store{DB: s.DB}).Read(ctx, false)
	if err != nil {
		return false, err
	}
	if values["notify.astrbot.enabled"] != true {
		return false, nil
	}
	var id, kind, payload string
	var attempts int
	err = s.DB.QueryRowContext(ctx, "SELECT id,kind,payload,attempts FROM notification_outbox WHERE state='pending' AND available_at<=? ORDER BY available_at,id LIMIT 1", time.Now().UnixMilli()).Scan(&id, &kind, &payload, &attempts)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if values["notify.astrbot."+kind] == false {
		_, err = s.DB.ExecContext(ctx, "UPDATE notification_outbox SET available_at=? WHERE id=?", time.Now().Add(time.Minute).UnixMilli(), id)
		return true, err
	}
	target, _ := values["notify.astrbot.url"].(string)
	token, sendErr := s.Token(ctx)
	if sendErr == nil {
		if !endpoint(target) || token == "" {
			sendErr = errors.New("请配置接收地址并生成 API Token")
		} else {
			request, err := http.NewRequestWithContext(ctx, "POST", target, bytes.NewBufferString(payload))
			if err != nil {
				sendErr = errors.New("接收地址无效")
			} else {
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("X-MicroLight-Token", token)
				if key, ok := values["api.astrbot.token"].(string); ok && strings.TrimSpace(key) != "" {
					request.Header.Set("X-API-Key", strings.TrimSpace(key))
				}
				if client == nil {
					client = &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
				}
				response, err := client.Do(request)
				if err != nil {
					sendErr = errors.New("通知接收端连接失败或超时")
				} else {
					var ack struct {
						Accepted bool   `json:"accepted"`
						ID       string `json:"id"`
					}
					decodeErr := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&ack)
					response.Body.Close()
					if response.StatusCode != http.StatusOK {
						sendErr = fmt.Errorf("通知接收端返回 HTTP %d", response.StatusCode)
					} else if decodeErr != nil || !ack.Accepted || ack.ID != id {
						sendErr = errors.New("接收端未确认事件已保存")
					}
				}
			}
		}
	}
	if ctx.Err() != nil {
		return false, ctx.Err()
	}
	if sendErr != nil {
		attempts++
		state := "pending"
		if attempts >= 10 {
			state = "failed"
		}
		delay := 30 * time.Second * time.Duration(1<<min(attempts-1, 7))
		delay = min(delay, time.Hour)
		_, err = s.DB.ExecContext(ctx, "UPDATE notification_outbox SET state=?,attempts=?,available_at=?,last_error=? WHERE id=?", state, attempts, time.Now().Add(delay).UnixMilli(), sendErr.Error(), id)
		return true, err
	}
	_, err = s.DB.ExecContext(ctx, "UPDATE notification_outbox SET state='delivered',attempts=attempts+1,last_error='' WHERE id=?", id)
	if err == nil {
		_, err = s.DB.ExecContext(ctx, "DELETE FROM notification_outbox WHERE state='delivered' AND available_at<? LIMIT 100", time.Now().Add(-30*24*time.Hour).UnixMilli())
	}
	return true, err
}
func (s Store) Run(ctx context.Context) {
	timer := time.NewTicker(2 * time.Second)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			for i := 0; i < 8; i++ {
				worked, err := s.Deliver(ctx, nil)
				if err != nil || !worked {
					break
				}
			}
		}
	}
}
