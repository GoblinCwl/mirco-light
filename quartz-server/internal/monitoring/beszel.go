package monitoring

import (
	"bufio"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/taskconfig"
	"io"
	_ "modernc.org/sqlite"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Point struct {
	Time  int64          `json:"time"`
	Stats map[string]any `json:"stats"`
}
type stream struct {
	points []Point
	used   time.Time
	cancel context.CancelFunc
	base   string
	retry  time.Time
}
type Manager struct {
	Registry      *Registry
	DB            *sql.DB
	Settings      func(context.Context) (map[string]any, error)
	Client        *http.Client
	ctx           context.Context
	cancel        context.CancelFunc
	mu            sync.Mutex
	live          map[string]*stream
	wg            sync.WaitGroup
	servicesMu    sync.Mutex
	servicesUntil time.Time
	servicesValue []Service
}

func Open(ctx context.Context, path string, settings func(context.Context) (map[string]any, error)) (*Manager, error) {
	u := url.URL{Scheme: "file", Path: path}
	q := u.Query()
	q.Set("mode", "ro")
	q.Add("_pragma", "busy_timeout=3000")
	u.RawQuery = q.Encode()
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	check, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err = db.PingContext(check); err != nil {
		db.Close()
		return nil, err
	}
	root, stop := context.WithCancel(ctx)
	m := &Manager{DB: db, Settings: settings, ctx: root, cancel: stop, live: map[string]*stream{}}
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		tick := taskconfig.NewTicker(root, "monitor-cleanup")
		defer tick.Stop()
		for {
			select {
			case <-root.Done():
				return
			case now := <-tick.C:
				m.mu.Lock()
				for _, s := range m.live {
					if s.cancel != nil && now.Sub(s.used) > 20*time.Second {
						s.cancel()
					}
				}
				m.mu.Unlock()
			}
		}
	}()
	return m, nil
}
func (m *Manager) Close() error { m.cancel(); m.wg.Wait(); return m.DB.Close() }
func (m *Manager) client() *http.Client {
	if m.Client != nil {
		return m.Client
	}
	return &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func option(values map[string]any, key, fallback string) string {
	if v, ok := values[key].(string); ok && v != "" {
		return v
	}
	return fallback
}
func (m *Manager) token(ctx context.Context, settings map[string]any) (string, error) {
	if v := option(settings, "api.beszel.token", ""); v != "" {
		return v, nil
	}
	var collection, options, id, key string
	if err := m.DB.QueryRowContext(ctx, "SELECT id,options FROM _collections WHERE name='users'").Scan(&collection, &options); err != nil {
		return "", err
	}
	if err := m.DB.QueryRowContext(ctx, "SELECT id,tokenKey FROM users ORDER BY created LIMIT 1").Scan(&id, &key); err != nil {
		return "", err
	}
	var config struct {
		AuthToken struct {
			Secret string `json:"secret"`
		} `json:"authToken"`
	}
	if err := json.Unmarshal([]byte(options), &config); err != nil {
		return "", err
	}
	if config.AuthToken.Secret == "" {
		return "", errors.New("Beszel authentication unavailable")
	}
	body, _ := json.Marshal(map[string]any{"id": id, "collectionId": collection, "type": "auth", "refreshable": false, "exp": time.Now().Unix() + 300})
	encode := base64.RawURLEncoding.EncodeToString
	signed := encode([]byte(`{"alg":"HS256","typ":"JWT"}`)) + "." + encode(body)
	mac := hmac.New(sha256.New, []byte(key+config.AuthToken.Secret))
	mac.Write([]byte(signed))
	return signed + "." + encode(mac.Sum(nil)), nil
}
func (m *Manager) connect(ctx context.Context, id string, state *stream, base string, settings map[string]any) {
	defer m.wg.Done()
	defer func() { m.mu.Lock(); state.cancel = nil; state.retry = time.Now().Add(5 * time.Second); m.mu.Unlock() }()
	req, err := http.NewRequestWithContext(ctx, "GET", base+"/api/realtime", nil)
	if err != nil {
		return
	}
	response, err := alerts.Do(m.client(), "Beszel", req)
	if err != nil {
		return
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return
	}
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	event, eventID := "", ""
	data := []string{}
	dispatch := func() error {
		var value map[string]any
		if len(data) > 0 && json.Unmarshal([]byte(strings.Join(data, "\n")), &value) != nil {
			return nil
		}
		if event == "PB_CONNECT" {
			token, err := m.token(ctx, settings)
			if err != nil {
				return err
			}
			clientID := eventID
			if clientID == "" {
				clientID, _ = value["clientId"].(string)
			}
			if clientID == "" {
				return errors.New("missing realtime client")
			}
			query, _ := json.Marshal(map[string]any{"query": map[string]any{"system": id}})
			// QueryEscape uses '+' for spaces; the compact JSON contains none.
			subscription := "rt_metrics?options=" + url.QueryEscape(string(query))
			body, _ := json.Marshal(map[string]any{"clientId": clientID, "subscriptions": []string{subscription}})
			postCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			request, err := http.NewRequestWithContext(postCtx, "POST", base+"/api/realtime", strings.NewReader(string(body)))
			if err != nil {
				return err
			}
			request.Header.Set("Authorization", token)
			request.Header.Set("Content-Type", "application/json")
			subscribed, err := alerts.Do(m.client(), "Beszel", request)
			if err != nil {
				return err
			}
			defer subscribed.Body.Close()
			io.Copy(io.Discard, io.LimitReader(subscribed.Body, 4096))
			if subscribed.StatusCode < 200 || subscribed.StatusCode >= 300 {
				return errors.New("realtime subscription unavailable")
			}
		} else if strings.HasPrefix(event, "rt_metrics") && object(value["stats"]) != nil {
			now := time.Now()
			point := Point{Time: now.UnixMilli(), Stats: Stats(object(value["stats"]))}
			m.mu.Lock()
			state.points = append(state.points, point)
			start := 0
			for start < len(state.points) && (state.points[start].Time < now.Add(-time.Minute).UnixMilli() || len(state.points)-start > 45) {
				start++
			}
			state.points = state.points[start:]
			m.mu.Unlock()
		}
		return nil
	}
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\r")
		if line == "" {
			if err := dispatch(); err != nil {
				return
			}
			event, eventID = "", ""
			data = nil
			continue
		}
		if strings.HasPrefix(line, ":") {
			continue
		}
		key, v, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		v = strings.TrimPrefix(v, " ")
		switch key {
		case "event":
			event = v
		case "id":
			eventID = v
		case "data":
			data = append(data, v)
		}
	}
}
func (m *Manager) recent(id string, values map[string]any) []Point {
	base := strings.TrimRight(option(values, "api.beszel.url", "http://beszel:8090"), "/")
	now := time.Now()
	m.mu.Lock()
	defer m.mu.Unlock()
	state := m.live[id]
	if state == nil {
		state = &stream{}
		m.live[id] = state
	}
	state.used = now
	if state.cancel != nil && state.base != base {
		state.cancel()
	}
	if state.cancel == nil && now.After(state.retry) && m.ctx.Err() == nil {
		ctx, cancel := context.WithCancel(m.ctx)
		state.cancel = cancel
		state.base = base
		m.wg.Add(1)
		go m.connect(ctx, id, state, base, values)
	}
	points := []Point{}
	for _, point := range state.points {
		if point.Time >= now.Add(-time.Minute).UnixMilli() {
			points = append(points, point)
		}
	}
	return points
}
func (m *Manager) Monitoring(ctx context.Context) (map[string]any, error) {
	values, err := m.Settings(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := m.DB.QueryContext(ctx, "SELECT id,name,status,info,updated FROM systems WHERE name=?", "Cwl-Server")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	systems := []map[string]any{}
	for rows.Next() {
		var id, name, status, info, updated string
		if err = rows.Scan(&id, &name, &status, &info, &updated); err != nil {
			return nil, err
		}
		var details map[string]any
		json.Unmarshal([]byte(info), &details)
		publicInfo := map[string]any{}
		if uptime, ok := details["u"]; ok {
			publicInfo["u"] = uptime
		}
		recent := m.recent(id, values)
		var at any
		for _, format := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999Z", "2006-01-02 15:04:05.999"} {
			if date, err := time.Parse(format, updated); err == nil {
				at = date.UnixMilli()
				break
			}
		}
		current := map[string]any{}
		if len(recent) > 0 {
			at = recent[len(recent)-1].Time
			current = recent[len(recent)-1].Stats
		}
		systems = append(systems, map[string]any{"id": id, "name": name, "status": status, "updated": at, "info": publicInfo, "current": current, "history": recent})
	}
	return map[string]any{"range": "1m", "generatedAt": time.Now().UnixMilli(), "systems": systems}, rows.Err()
}
