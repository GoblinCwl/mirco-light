// Package friendmail delivers durable review mail using the site's existing Artalk SMTP configuration.
package friendmail

import (
	"bytes"
	"context"
	"crypto/tls"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"gopkg.in/yaml.v3"
	"html/template"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

//go:embed result.html
var source string

//go:embed approved.html
var approvedSource string

//go:embed feedback.html
var feedbackSource string
var feedbackLayout = template.Must(template.New("feedback-resolved").Parse(feedbackSource))
var layout = template.Must(template.New("friend-review").Parse(source + approvedSource))

type Message struct {
	ID, To, Name, Reason string
	Kind                 string
	Accepted             bool
	Attempts             int
	FriendNumber         int64
	FriendURL            string
	FriendAvatar         string
	FriendDescription    string
}
type Store struct {
	DB                 *sql.DB
	ConfigPath, Origin string
	Send               func(context.Context, Message) error
}

type deliveryError struct {
	stage string
	code  int
}

func (e *deliveryError) Error() string {
	if e.code != 0 {
		return fmt.Sprintf("SMTP %d · %s", e.code, strings.TrimPrefix(e.stage, "SMTP "))
	}
	return e.stage
}

func mailFailure(stage string, err error) error {
	failure := &deliveryError{stage: stage}
	var reply *textproto.Error
	if errors.As(err, &reply) {
		failure.code = reply.Code
	}
	return failure
}

func mailHeading(kind string, accepted bool) string {
	switch kind {
	case "feedback":
		return "反馈已处理"
	case "friends-removed":
		return "友链已移除"
	}
	if accepted {
		return "友链已添加"
	}
	return "友链申请未予收录"
}

func Render(m Message, origin string) (string, string, error) {
	heading := mailHeading(m.Kind, m.Accepted)
	origin = strings.TrimRight(origin, "/")
	selected := layout
	action := origin
	cardNumber := ""
	var domain, avatar string
	if m.Kind != "feedback" && m.Accepted {
		action = origin + "/friends/"
		if m.FriendNumber > 0 {
			cardNumber = fmt.Sprintf("#%03d", m.FriendNumber)
			action += "?card=" + url.QueryEscape(cardNumber)
		}
		if site, err := url.Parse(m.FriendURL); err == nil {
			domain = strings.TrimPrefix(site.Host, "www.")
		}
		if base, err := url.Parse(origin + "/"); err == nil && m.FriendAvatar != "" {
			if image, err := base.Parse(m.FriendAvatar); err == nil && image.Hostname() != "" && image.User == nil && (image.Scheme == "https" || image.Scheme == "http") {
				avatar = image.String()
			}
		}
	}
	if m.Kind == "feedback" {
		selected = feedbackLayout
		action = origin
	}
	initial := ""
	if m.Name != "" {
		first, _ := utf8.DecodeRuneInString(m.Name)
		initial = string(first)
	}
	var b bytes.Buffer
	err := selected.Execute(&b, struct {
		Name, Heading, Reason, SiteURL, FriendsURL, CardNumber string
		Domain, Avatar, Description, Initial                   string
		Accepted                                               bool
	}{m.Name, heading, m.Reason, origin, action, cardNumber, domain, avatar, m.FriendDescription, initial, m.Accepted})
	category := "友链审核"
	if m.Kind == "feedback" {
		category = "问题反馈"
	} else if m.Kind == "friends-removed" {
		category = "友链巡检"
	}
	return "[微光集 · " + category + "] " + heading, b.String(), err
}
func (s Store) smtpSend(ctx context.Context, m Message) error {
	var config struct {
		Email struct {
			Enabled  bool   `yaml:"enabled"`
			SendType string `yaml:"send_type"`
			Name     string `yaml:"send_name"`
			Address  string `yaml:"send_addr"`
			SMTP     struct {
				Host               string
				Port               int
				Username, Password string
			} `yaml:"smtp"`
		} `yaml:"email"`
	}
	raw, err := os.ReadFile(s.ConfigPath)
	if err != nil {
		return mailFailure("无法读取邮件配置", err)
	}
	if yaml.Unmarshal(raw, &config) != nil {
		return mailFailure("邮件配置无效", nil)
	}
	c := config.Email
	if !c.Enabled || c.SendType != "smtp" || c.SMTP.Host == "" {
		return mailFailure("SMTP 邮件服务未启用", nil)
	}
	from, err := mail.ParseAddress(c.Address)
	if err != nil {
		return mailFailure("发件地址无效", err)
	}
	from.Name = c.Name
	to, err := mail.ParseAddress(m.To)
	if err != nil {
		return mailFailure("收件地址无效", err)
	}
	subject, body, err := Render(m, s.Origin)
	if err != nil {
		return mailFailure("邮件模板渲染失败", err)
	}
	port := c.SMTP.Port
	if port == 0 {
		port = 587
	}
	address := net.JoinHostPort(c.SMTP.Host, strconv.Itoa(port))
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return mailFailure("SMTP 连接失败", err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(30 * time.Second))
	tlsConfig := &tls.Config{ServerName: c.SMTP.Host, MinVersion: tls.VersionTLS12}
	if port == 465 {
		secure := tls.Client(conn, tlsConfig)
		if err = secure.HandshakeContext(ctx); err != nil {
			return mailFailure("SMTP TLS 连接失败", err)
		}
		conn = secure
	}
	client, err := smtp.NewClient(conn, c.SMTP.Host)
	if err != nil {
		return mailFailure("SMTP 握手失败", err)
	}
	defer client.Close()
	if port != 465 {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return mailFailure("SMTP 服务未提供 TLS", nil)
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return mailFailure("SMTP TLS 升级失败", err)
		}
	}
	if c.SMTP.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", c.SMTP.Username, c.SMTP.Password, c.SMTP.Host)); err != nil {
			return mailFailure("SMTP 认证失败", err)
		}
	}
	if err := client.Mail(from.Address); err != nil {
		return mailFailure("SMTP 发件人被拒绝", err)
	}
	if err := client.Rcpt(to.Address); err != nil {
		return mailFailure("SMTP 收件人被拒绝", err)
	}
	writer, err := client.Data()
	if err != nil {
		return mailFailure("SMTP 拒绝提交邮件", err)
	}
	data := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMessage-ID: <%s@goblincwl.site>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", from.String(), to.String(), mime.QEncoding.Encode("UTF-8", subject), time.Now().Format(time.RFC1123Z), m.ID, encodeBody(body))
	if _, err = writer.Write([]byte(data)); err != nil {
		return mailFailure("SMTP 写入邮件失败", err)
	}
	if err := writer.Close(); err != nil {
		return mailFailure("SMTP 未确认接收邮件", err)
	}
	client.Quit()
	return nil
}
func (s Store) Deliver(ctx context.Context) (bool, error) {
	var m Message
	err := s.DB.QueryRowContext(ctx, `
		SELECT mail.id, mail.recipient, mail.name, mail.accepted, mail.reason, mail.attempts, mail.kind,
			COALESCE(f.number, 0), COALESCE(f.url, ''), COALESCE(f.avatar, ''), COALESCE(f.description, '')
		FROM friend_mail_outbox mail
		LEFT JOIN friends f ON f.id = mail.friend_id AND mail.kind = 'friends' AND mail.accepted = 1
		WHERE mail.state = 'pending' AND mail.available_at <= ?
		ORDER BY mail.created_at, mail.id LIMIT 1
	`, time.Now().UnixMilli()).Scan(&m.ID, &m.To, &m.Name, &m.Accepted, &m.Reason, &m.Attempts, &m.Kind,
		&m.FriendNumber, &m.FriendURL, &m.FriendAvatar, &m.FriendDescription)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	send := s.Send
	if send == nil {
		send = s.smtpSend
	}
	sendErr := send(ctx, m)
	if ctx.Err() != nil {
		return false, ctx.Err()
	}
	if sendErr == nil {
		_, err = s.DB.ExecContext(ctx, "UPDATE friend_mail_outbox SET state='sent',attempts=attempts+1,last_error='' WHERE id=?", m.ID)
	} else {
		state := "pending"
		if m.Attempts+1 >= 10 {
			state = "failed"
		}
		message := "邮件发送失败，请检查 SMTP 服务"
		var failure *deliveryError
		if errors.As(sendErr, &failure) {
			message = failure.Error()
		}
		_, err = s.DB.ExecContext(ctx, "UPDATE friend_mail_outbox SET state=?,attempts=attempts+1,available_at=?,last_error=? WHERE id=?", state, time.Now().Add(min(time.Minute*time.Duration(1<<min(m.Attempts, 6)), time.Hour)).UnixMilli(), message, m.ID)
	}
	return true, err
}
func (s Store) Run(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			for i := 0; i < 8; i++ {
				worked, err := s.Deliver(ctx)
				if err != nil || !worked {
					break
				}
			}
		}
	}
}
