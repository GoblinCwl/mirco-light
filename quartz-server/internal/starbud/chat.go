package starbud

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const UserLimit = 10
const IPLimit = 30
const StreamType = "text/event-stream"

var (
	beijing        = time.FixedZone("Asia/Shanghai", 8*60*60)
	ErrLimit       = errors.New("starbud daily limit reached")
	ErrUnavailable = errors.New("starbud unavailable")
)

type Message struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type Unlock struct {
	WorkID   string `json:"work_id"`
	Unlocked bool   `json:"unlocked"`
}

type Input struct {
	PrivateHistory bool      `json:"private_history,omitempty"`
	Unlock         *Unlock   `json:"unlocked_context,omitempty"`
	TurnID         string    `json:"-"`
	ClientIP       string    `json:"-"`
	Message        string    `json:"message"`
	PageURL        string    `json:"page_url"`
	History        []Message `json:"history"`
}

type Service struct {
	DB           *sql.DB
	ReadSettings func(context.Context) (map[string]any, error)
	BridgeToken  string
}

func Prepare(in Input, origin string) (Input, error) {
	in.Message = strings.TrimSpace(in.Message)
	if in.Message == "" || len([]rune(in.Message)) > 2000 || len(in.History) > 12 || len(in.History)%2 != 0 {
		return in, errors.New("消息格式无效，单条消息最多 2000 字")
	}
	var historySize int
	for index, msg := range in.History {
		role := "user"
		if index%2 != 0 {
			role = "assistant"
		}
		historySize += len(msg.Text)
		if msg.Role != role || strings.TrimSpace(msg.Text) == "" || historySize > 36000 {
			return in, errors.New("聊天上下文格式无效")
		}
	}
	base, err := url.Parse(origin)
	page, pageErr := url.Parse(in.PageURL)
	if err != nil || pageErr != nil || base.Host == "" || len(in.PageURL) > 2048 || page.User != nil ||
		page.Host != "" && (!strings.EqualFold(page.Host, base.Host) || page.Scheme != base.Scheme) ||
		page.Host == "" && (page.Scheme != "" || !strings.HasPrefix(page.Path, "/")) {
		return in, errors.New("页面地址无效")
	}
	query := url.Values{}
	if strings.TrimSuffix(page.Path, "/") == "/tags" {
		if tag := strings.TrimSpace(page.Query().Get("tag")); tag != "" && len(tag) <= 600 {
			query.Set("tag", tag)
		}
	}
	page.RawQuery, page.Fragment, page.RawFragment = query.Encode(), "", ""
	page.ForceQuery = false
	in.PageURL = base.ResolveReference(page).String()
	if in.History == nil {
		in.History = []Message{}
	}
	return in, nil
}

func (s Service) Reserve(ctx context.Context, at time.Time, user, ip string) error {
	_, err := s.reserve(ctx, at, user, ip, nil)
	return err
}

func (s Service) reserve(ctx context.Context, at time.Time, user, ip string, input *Input) (int64, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	day := at.In(beijing).Format(time.DateOnly)
	for _, bucket := range []struct {
		kind     string
		identity string
		limit    int
	}{{"ip", ip, IPLimit}, {"user", user, UserLimit}} {
		var address string
		if bucket.kind == "ip" && input != nil {
			address = input.ClientIP
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO starbud_daily_usage(day,scope,identity,turns,ip_address)
			VALUES (?,?,?,0,NULLIF(?,''))
			ON DUPLICATE KEY UPDATE ip_address=COALESCE(NULLIF(?,''),ip_address)`,
			day, bucket.kind, bucket.identity, address, address)
		if err != nil {
			return 0, err
		}
		result, err := tx.ExecContext(ctx, `UPDATE starbud_daily_usage SET turns=turns+1
			WHERE day=? AND scope=? AND identity=? AND turns<?`, day, bucket.kind, bucket.identity, bucket.limit)
		if err != nil {
			return 0, err
		}
		count, err := result.RowsAffected()
		if err != nil {
			return 0, err
		}
		if count != 1 {
			return 0, ErrLimit
		}
	}
	var recordID int64
	if input != nil && input.Unlock == nil && !input.PrivateHistory {
		result, err := tx.ExecContext(ctx, `INSERT INTO starbud_chat_records
			(conversation_id,page_url,question,created_at,client_ip) VALUES (?,?,?,?,NULLIF(?,''))`,
			user, input.PageURL, input.Message, at.UTC().Format("2006-01-02T15:04:05.000Z"), input.ClientIP)
		if err != nil {
			return 0, err
		}
		if recordID, err = result.LastInsertId(); err != nil {
			return 0, err
		}
	}
	return recordID, tx.Commit()
}

func (s Service) finishRecord(ctx context.Context, id int64, answer string, complete bool) {
	if id == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()
	var status = "未能回复"
	if complete {
		status = "已回复"
	} else if strings.TrimSpace(answer) != "" {
		status = "回复中断"
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE starbud_chat_records SET answer=NULLIF(?,''),status=? WHERE id=?`, answer, status, id); err != nil {
		slog.Error("starbud archive update failed", "id", id, "error", err)
	}
}

type Quota struct {
	Remaining int       `json:"remaining"`
	Limit     int       `json:"limit"`
	ResetsAt  time.Time `json:"resets_at"`
}

func (s Service) Quota(ctx context.Context, at time.Time, user, ip string) (Quota, error) {
	local := at.In(beijing)
	var userTurns, ipTurns int
	err := s.DB.QueryRowContext(ctx, `SELECT
		COALESCE(MAX(CASE WHEN scope='user' THEN turns END), 0),
		COALESCE(MAX(CASE WHEN scope='ip' THEN turns END), 0)
		FROM starbud_daily_usage
		WHERE day=? AND ((scope='user' AND identity=?) OR (scope='ip' AND identity=?))`,
		local.Format(time.DateOnly), user, ip).Scan(&userTurns, &ipTurns)
	return Quota{
		Remaining: max(0, min(UserLimit-userTurns, IPLimit-ipTurns)),
		Limit:     UserLimit,
		ResetsAt:  time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, beijing),
	}, err
}

var client = &http.Client{Timeout: 100 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func (s Service) Reply(ctx context.Context, now time.Time, user, ip string, in Input) (string, error) {
	res, recordID, err := s.requestReply(ctx, now, user, ip, in, "application/json")
	if err != nil {
		s.finishRecord(ctx, recordID, "", false)
		return "", err
	}
	defer res.Body.Close()
	answer, err := readReply(res.Body)
	s.finishRecord(ctx, recordID, answer, err == nil)
	return answer, err
}

func readReply(body io.Reader) (string, error) {
	var reply struct {
		Reply string `json:"reply"`
	}
	if json.NewDecoder(io.LimitReader(body, 96<<10)).Decode(&reply) != nil || strings.TrimSpace(reply.Reply) == "" {
		return "", ErrUnavailable
	}
	return reply.Reply, nil
}

type StreamEvent struct {
	Type      string `json:"type"`
	Text      string `json:"text,omitempty"`
	TurnID    string `json:"turn_id,omitempty"`
	RequestID string `json:"request_id,omitempty"`
	Action    string `json:"action,omitempty"`
	Query     string `json:"query,omitempty"`
	FileRef   string `json:"file_ref,omitempty"`
	Cursor    int    `json:"cursor,omitempty"`
}

func (s Service) StreamReply(ctx context.Context, now time.Time, user, ip string, in Input, send func(StreamEvent) error) error {
	res, recordID, err := s.requestReply(ctx, now, user, ip, in, StreamType)
	var answer strings.Builder
	var complete bool
	defer func() { s.finishRecord(ctx, recordID, answer.String(), complete) }()
	if err != nil {
		return err
	}
	defer res.Body.Close()
	// Allow a JSON response during independent upgrades of the bridge and site.
	if !strings.HasPrefix(res.Header.Get("Content-Type"), StreamType) {
		text, err := readReply(res.Body)
		if err != nil {
			return err
		}
		answer.WriteString(text)
		complete = true
		return send(StreamEvent{Type: "done", Text: text})
	}
	return relayStream(res.Body, func(event StreamEvent) error {
		switch event.Type {
		case "delta":
			if answer.Len()+len(event.Text) <= 48<<10 {
				answer.WriteString(event.Text)
			}
		case "done":
			answer.Reset()
			answer.WriteString(event.Text)
			complete = strings.TrimSpace(event.Text) != ""
		case "reset":
			answer.Reset()
		}
		return send(event)
	})
}

func relayStream(body io.Reader, send func(StreamEvent) error) error {
	scanner := bufio.NewScanner(io.LimitReader(body, 1<<20))
	scanner.Buffer(make([]byte, 4096), 96<<10)
	for scanner.Scan() {
		data, ok := strings.CutPrefix(scanner.Text(), "data: ")
		if !ok {
			continue
		}
		var event StreamEvent
		if json.Unmarshal([]byte(data), &event) != nil {
			return ErrUnavailable
		}
		switch event.Type {
		case "ready", "reset", "delta", "done", "read_request":
			if err := send(event); err != nil {
				return err
			}
			if event.Type == "done" {
				return nil
			}
		case "error":
			return ErrUnavailable
		}
	}
	return ErrUnavailable
}

func (s Service) requestReply(ctx context.Context, now time.Time, user, ip string, in Input, accept string) (*http.Response, int64, error) {
	payload := struct {
		Input
		Visitor      string `json:"visitor"`
		Continuation string `json:"turn_id,omitempty"`
	}{in, user, in.TurnID}
	req, err := s.bridgeRequest(ctx, "chat", accept, payload)
	if err != nil {
		return nil, 0, err
	}
	recordID, err := s.reserve(ctx, now, user, ip, &in)
	if err != nil {
		return nil, 0, err
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, recordID, ErrUnavailable
	}
	if res.StatusCode != http.StatusOK {
		res.Body.Close()
		return nil, recordID, ErrUnavailable
	}
	return res, recordID, nil
}

type ContextResult struct {
	TurnID    string          `json:"turn_id"`
	RequestID string          `json:"request_id"`
	Result    json.RawMessage `json:"result"`
}

func (s Service) SubmitContext(ctx context.Context, result ContextResult) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := s.bridgeRequest(ctx, "context", "application/json", result)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return ErrUnavailable
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusNoContent {
		return ErrUnavailable
	}
	return nil
}

func (s Service) bridgeRequest(ctx context.Context, route, accept string, payload any) (*http.Request, error) {
	values, err := s.ReadSettings(ctx)
	if err != nil {
		return nil, err
	}
	base, _ := values["api.astrbot.url"].(string)
	key, _ := values["api.astrbot.token"].(string)
	if base == "" || key == "" || s.BridgeToken == "" {
		return nil, ErrUnavailable
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(base, "/")+
		"/api/v1/plugins/extensions/astrbot_plugin_starbud/"+route, bytes.NewReader(data))
	if err != nil {
		return nil, ErrUnavailable
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", accept)
	req.Header.Set("X-API-Key", key)
	req.Header.Set("X-Starbud-Token", s.BridgeToken)
	return req, nil
}
