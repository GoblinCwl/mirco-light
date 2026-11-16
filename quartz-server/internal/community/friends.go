package community

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"goblincwl/quartz-server/internal/friendavatar"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

type Store struct {
	DB            *sql.DB
	StoreAvatar   func(context.Context, string) (string, error)
	ReadFeed      func(context.Context, string) (time.Time, error)
	CheckBacklink func(context.Context, Friend) (BacklinkResult, error)
	CheckHomepage func(context.Context, string) error
}
type Friend struct {
	ID                 string `json:"id"`
	Email              string `json:"email,omitempty"`
	ProcessingFailures int    `json:"processingFailures,omitempty"`
	FailureNotified    bool   `json:"failureNotified,omitempty"`
	FailureMailSent    bool   `json:"failureMailSent,omitempty"`
	FailureLimit       int    `json:"failureLimit,omitempty"`
	ReviewReady        bool   `json:"reviewReady,omitempty"`
	InspectionGrayDays int    `json:"inspectionGrayDays"`
	InspectionFailures int    `json:"inspectionFailures"`
	Number             int64  `json:"number"`
	Name               string `json:"name"`
	URL                string `json:"url"`
	BacklinkURL        string `json:"backlinkUrl"`
	RSSURL             string `json:"rssUrl"`
	Avatar             string `json:"avatar"`
	AvatarSource       string `json:"avatarSource"`
	LatestUpdate       string `json:"latestUpdate"`
	Description        string `json:"description"`
	Example            bool   `json:"example,omitempty"`
	Status             string `json:"status"`
	ReviewResult       string `json:"reviewResult"`
	ReviewCheckedAt    string `json:"reviewCheckedAt"`
	HealthFailures     int    `json:"healthFailures"`
	HealthCheckedOn    string `json:"healthCheckedOn"`
	HealthError        string `json:"healthError"`
}

func uuid() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&15 | 64
	b[8] = b[8]&63 | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func website(value string) (string, error) {
	if len(value) > 1500 {
		return "", errors.New("请填写有效的网站链接")
	}
	u, err := url.Parse(value)
	if err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", errors.New("请使用有效的 http 或 https 链接")
	}
	if u.Path == "" {
		u.Path = "/"
	}
	u.Host = strings.ToLower(u.Host)
	return u.String(), nil
}
func validFriend(f Friend, application bool) (Friend, error) {
	f.Name = strings.TrimSpace(f.Name)
	f.Avatar = strings.TrimSpace(f.Avatar)
	f.Description = strings.TrimSpace(f.Description)
	f.AvatarSource = strings.TrimSpace(f.AvatarSource)
	if strings.HasPrefix(f.Avatar, "https://") || strings.HasPrefix(f.Avatar, "http://") {
		f.AvatarSource = f.Avatar
	}
	if f.AvatarSource != "" {
		source, err := website(f.AvatarSource)
		if err != nil {
			return f, errors.New("请填写有效的原始头像地址（HTTP 或 HTTPS）")
		}
		f.AvatarSource = source
	}
	if f.Name == "" || utf8.RuneCountInString(f.Name) > 80 || strings.IndexFunc(f.Name, func(c rune) bool { return c < 32 }) >= 0 {
		return f, errors.New("请填写站点名称，最多 80 字")
	}
	address, err := website(strings.TrimSpace(f.URL))
	if err != nil {
		return f, err
	}
	f.URL = address
	f.BacklinkURL = strings.TrimSpace(f.BacklinkURL)
	if f.BacklinkURL == "" {
		return f, errors.New("请填写包含本站友链的页面地址")
	}
	backlink, err := website(f.BacklinkURL)
	if err != nil || !strings.HasPrefix(backlink, "https://") {
		return f, errors.New("包含本站友链的页面地址须为有效的 HTTPS 链接")
	}
	f.BacklinkURL = backlink
	f.RSSURL = strings.TrimSpace(f.RSSURL)
	if f.RSSURL != "" {
		rss, err := website(f.RSSURL)
		if err != nil {
			return f, errors.New("请填写有效的 RSS 地址（HTTP 或 HTTPS）")
		}
		f.RSSURL = rss
	}
	if utf8.RuneCountInString(f.Description) > 300 {
		return f, errors.New("站点简介最多 300 字")
	}
	if f.Avatar != "" {
		if friendavatar.Local(f.Avatar) {
			// Stored avatars use a fixed, content-addressed site route.
		} else if strings.HasPrefix(f.Avatar, "/static/") {
			if strings.Contains(f.Avatar, "\\") || containsSegment(f.Avatar, "..") {
				return f, errors.New("头像链接无效")
			}
		} else {
			if _, err = website(f.Avatar); err != nil {
				return f, errors.New("头像链接无效")
			}
		}
	}
	f.Email = strings.TrimSpace(f.Email)
	if (application || f.Email != "") && (len(f.Email) > 254 || !email.MatchString(f.Email)) {
		return f, errors.New("请填写有效的邮箱地址")
	}
	if application {
		f.Status = "待审核"
		f.Example = false
		if f.Avatar == "" || f.Description == "" || utf8.RuneCountInString(f.Description) > 40 {
			return f, errors.New("请填写头像和站点简介，简介最多40字")
		}
		if !strings.HasPrefix(f.URL, "https://") || !strings.HasPrefix(f.Avatar, "https://") {
			return f, errors.New("网站和头像地址须为 HTTPS 链接")
		}
	}
	if f.Status == "" {
		f.Status = "展示中"
	}
	if f.Status != "展示中" && f.Status != "待审核" && f.Status != "已失效" {
		return f, errors.New("友链状态无效")
	}
	return f, nil
}
func containsSegment(path, segment string) bool {
	for _, p := range strings.Split(path, "/") {
		if p == segment {
			return true
		}
	}
	return false
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func readFriends(ctx context.Context, q queryer, public bool) ([]Friend, error) {
	query := "SELECT id,number,name,url,backlink_url,rss_url,avatar,avatar_source,latest_update,description,example,status,review_result,review_checked_at,health_failures,health_checked_on,health_error,email,processing_failures,failure_notified,failure_mail_sent,COALESCE((SELECT CAST(JSON_UNQUOTE(value) AS UNSIGNED) FROM settings WHERE `key`='friends.failureLimit'),5),review_ready,inspection_failures,COALESCE((SELECT CAST(JSON_UNQUOTE(value) AS UNSIGNED) FROM settings WHERE `key`='tasks.friendsGrayDays'),3) FROM friends"
	if public {
		query += " WHERE status='展示中'"
	}
	query += " ORDER BY latest_update DESC,number,id"
	rows, err := q.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	friends := []Friend{}
	for rows.Next() {
		var f Friend
		if err = rows.Scan(&f.ID, &f.Number, &f.Name, &f.URL, &f.BacklinkURL, &f.RSSURL, &f.Avatar, &f.AvatarSource, &f.LatestUpdate, &f.Description, &f.Example, &f.Status, &f.ReviewResult, &f.ReviewCheckedAt, &f.HealthFailures, &f.HealthCheckedOn, &f.HealthError, &f.Email, &f.ProcessingFailures, &f.FailureNotified, &f.FailureMailSent, &f.FailureLimit, &f.ReviewReady, &f.InspectionFailures, &f.InspectionGrayDays); err != nil {
			return nil, err
		}
		if public {
			f.Email = ""
			f.ProcessingFailures = 0
			f.FailureNotified = false
			f.FailureMailSent = false
			f.FailureLimit = 0
			f.ReviewReady = false
		}
		friends = append(friends, f)
	}
	return friends, rows.Err()
}
func (s Store) Friends(ctx context.Context, public bool) ([]Friend, error) {
	return readFriends(ctx, s.DB, public)
}
func (s Store) transaction(ctx context.Context) (*sql.Tx, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	var name string
	if err = tx.QueryRowContext(ctx, "SELECT name FROM resource_locks WHERE name='friends' FOR UPDATE").Scan(&name); err != nil {
		tx.Rollback()
		return nil, err
	}
	return tx, nil
}
func (s Store) CreateFriend(ctx context.Context, f Friend, application bool) (Friend, []Friend, error) {
	f, err := validFriend(f, application)
	if err != nil {
		return f, nil, err
	}
	f.LatestUpdate = ""
	f.ReviewResult = ""
	f.ReviewCheckedAt = ""
	f.HealthFailures = 0
	f.HealthCheckedOn = ""
	f.HealthError = ""
	f.ID, err = uuid()
	if err != nil {
		return f, nil, err
	}
	tx, err := s.transaction(ctx)
	if err != nil {
		return f, nil, err
	}
	defer tx.Rollback()
	var count int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM friends").Scan(&count); err != nil {
		return f, nil, err
	}
	if count >= 150 {
		return f, nil, errors.New("最多可添加 150 个站点")
	}
	var duplicates int
	if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM friends WHERE url=?", f.URL).Scan(&duplicates); err != nil {
		return f, nil, err
	}
	if duplicates > 0 {
		return f, nil, errors.New("该站点已展示或已提交申请，请勿重复提交")
	}
	result, err := tx.ExecContext(ctx, "INSERT INTO friends(id,name,url,backlink_url,rss_url,avatar,avatar_source,latest_update,description,example,status,review_result,review_checked_at,email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", f.ID, f.Name, f.URL, f.BacklinkURL, f.RSSURL, f.Avatar, f.AvatarSource, f.LatestUpdate, f.Description, f.Example, f.Status, f.ReviewResult, f.ReviewCheckedAt, f.Email)
	if err != nil {
		return f, nil, err
	}
	f.Number, err = result.LastInsertId()
	if err != nil {
		return f, nil, err
	}
	if err = EnqueueFriendTx(ctx, tx, f.ID); err != nil {
		return f, nil, err
	}

	friends, err := readFriends(ctx, tx, false)
	if err != nil {
		return f, nil, err
	}
	if err = tx.Commit(); err != nil {
		return f, nil, err
	}
	return f, friends, nil
}
func (s Store) UpdateFriend(ctx context.Context, id string, f Friend, action string, _ int) ([]Friend, error) {
	tx, err := s.transaction(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	friends, err := readFriends(ctx, tx, false)
	if err != nil {
		return nil, err
	}
	index := -1
	for i, row := range friends {
		if row.ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return nil, errors.New("友链记录不存在，请刷新列表")
	}

	if (action == "review" || action == "update") && f.Status == "展示中" && friends[index].Status != "展示中" {
		var ready bool
		if err = tx.QueryRowContext(ctx, "SELECT review_ready FROM friends WHERE id=? FOR UPDATE", id).Scan(&ready); err != nil {
			return nil, err
		}
		if !ready {
			return nil, errors.New("首页检查、RSS 拉取或头像处理尚未全部通过，不能审核通过，请先执行后台检查")
		}
		if action == "update" && (f.URL != friends[index].URL || f.RSSURL != friends[index].RSSURL || f.Avatar != friends[index].Avatar || f.AvatarSource != friends[index].AvatarSource) {
			return nil, errors.New("请先保存变更并等待后台检查，再审核通过")
		}
	}
	friendsBeforeStatus := friends[index].Status
	switch action {
	case "abandon":
		current := friends[index]
		if current.ProcessingFailures < current.FailureLimit {
			return nil, errors.New("尚未达到失败次数阈值，不能弃用")
		}
		if current.Email == "" {
			return nil, errors.New("该友链未填写通知邮箱，无法发送弃用邮件；如需直接删除，请使用移除操作")
		}
		if err = EnqueueFriendMailTx(ctx, tx, current, false, "友链多次处理失败，本站已停止处理并移除该申请。"); err != nil {
			return nil, err
		}
		_, err = tx.ExecContext(ctx, "DELETE FROM friends WHERE id=?", id)
	case "failure-mail":
		current := friends[index]
		if current.Email == "" {
			return nil, errors.New("该友链未填写通知邮箱")
		}
		if !current.FailureMailSent {
			if err = EnqueueFriendMailTx(ctx, tx, current, false, "友链申请未通过审核，请检查站点和包含本站友链的页面。"); err != nil {
				return nil, err
			}
			_, err = tx.ExecContext(ctx, "UPDATE friends SET failure_mail_sent=1 WHERE id=?", id)
		}
	case "delete":
		_, err = tx.ExecContext(ctx, "DELETE FROM friends WHERE id=?", id)
	case "review":
		current := friends[index]
		current.Status = f.Status
		if _, err = validFriend(current, false); err != nil {
			return nil, err
		}
		if current.Status != "已失效" {
			current.HealthFailures = 0
			current.HealthCheckedOn = ""
			current.HealthError = ""
		}
		_, err = tx.ExecContext(ctx, "UPDATE friends SET status=?,review_result=?,review_checked_at=?,health_failures=?,health_checked_on=?,health_error=? WHERE id=?", current.Status, "人工审核："+current.Status, time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), current.HealthFailures, current.HealthCheckedOn, current.HealthError, id)
	case "update":
		f.ID = id
		f.Email = friends[index].Email
		f.Example = friends[index].Example

		f.LatestUpdate = friends[index].LatestUpdate
		f, err = validFriend(f, false)
		if err != nil {
			return nil, err
		}
		if f.RSSURL != friends[index].RSSURL {
			f.LatestUpdate = ""
		}
		f.HealthFailures = friends[index].HealthFailures
		f.HealthCheckedOn = friends[index].HealthCheckedOn
		f.HealthError = friends[index].HealthError
		if f.URL != friends[index].URL || f.Status != "已失效" && f.Status != friends[index].Status {
			f.HealthFailures = 0
			f.HealthCheckedOn = ""
			f.HealthError = ""
		}
		f.ReviewResult = friends[index].ReviewResult
		f.ReviewCheckedAt = friends[index].ReviewCheckedAt
		if f.URL != friends[index].URL || f.BacklinkURL != friends[index].BacklinkURL {
			f.ReviewResult = ""
			f.ReviewCheckedAt = ""
		}
		if f.Status != friends[index].Status {
			f.ReviewResult = "人工审核：" + f.Status
			f.ReviewCheckedAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		}
		var duplicate int
		if err = tx.QueryRowContext(ctx, "SELECT count(*) FROM friends WHERE url=? AND id<>?", f.URL, id).Scan(&duplicate); err != nil {
			return nil, err
		}
		if duplicate > 0 {
			return nil, errors.New("该站点链接已经存在")
		}
		_, err = tx.ExecContext(ctx, "UPDATE friends SET name=?,url=?,backlink_url=?,rss_url=?,avatar=?,avatar_source=?,latest_update=?,description=?,status=?,review_result=?,review_checked_at=?,health_failures=?,health_checked_on=?,health_error=? WHERE id=?", f.Name, f.URL, f.BacklinkURL, f.RSSURL, f.Avatar, f.AvatarSource, f.LatestUpdate, f.Description, f.Status, f.ReviewResult, f.ReviewCheckedAt, f.HealthFailures, f.HealthCheckedOn, f.HealthError, id)
	default:
		return nil, errors.New("操作无效")
	}
	if err != nil {
		return nil, err
	}
	if action == "update" || action == "review" {
		if err = EnqueueFriendTx(ctx, tx, id); err != nil {
			return nil, err
		}
	}
	friends, err = readFriends(ctx, tx, false)
	if err != nil {
		return nil, err
	}
	for _, updated := range friends {
		if updated.ID == id && (action == "review" || action == "update") && updated.Status != friendsBeforeStatus {
			if updated.Status == "展示中" {
				if err = EnqueueFriendMailTx(ctx, tx, updated, updated.Status == "展示中", "人工审核："+updated.Status); err != nil {
					return nil, err
				}
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return friends, nil
}

// ValidateFriend is shared by the dedicated and generic administrator editors.
func ValidateFriend(f Friend) (Friend, error) { return validFriend(f, false) }
