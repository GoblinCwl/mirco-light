package monitoring

import (
	"context"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type Service struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	State  string `json:"state"`
	Source string `json:"source"`
	Icon   string `json:"icon"`
}
type definition struct {
	id, name, container, target string
	health                      bool
}

var definitions = []definition{
	{"quartz-server", "Quartz Server", "quartz-server", "http://quartz-server:8080/health/ready", true},
	{"artalk", "Artalk", "artalk", "http://artalk:23366/api/v2/conf", false},
	{"openlist", "OpenList", "openlist", "http://openlist:5244/api/public/settings", false},
	{"danmu", "DanmuApi", "danmu-api", "http://danmu-api:9321/", false},
	{"jellyfin", "Jellyfin", "jellyfin", "http://jellyfin:8096/health", true},
	{"fontinass", "Fontinass", "fontinass", "http://fontinass:8011/", false},
	{"gitea", "Gitea", "gitea", "http://gitea:3000/api/v1/version", true},
	{"activitywatch", "ActivityWatch", "activitywatch", "http://host.docker.internal:5600/api/0/info", true},
	{"astrbot", "AstrBot", "astrbot", "http://astrbot:6185/", false},
	{"napcat", "NapCat", "napcat", "http://napcat:6099/", false},
	{"beszel", "Beszel", "beszel", "http://beszel:8090/api/health", true},
}
var errorState = regexp.MustCompile(`(?i)restarting|unhealthy|dead`)
var runningState = regexp.MustCompile(`(?i)^up\b`)
var offlineState = regexp.MustCompile(`(?i)exited|stopped|created`)

func ContainerState(host, status string, health int, updated int64, now time.Time) string {
	if host == "down" {
		return "offline"
	}
	if host != "up" || now.UnixMilli()-updated >= 180000 {
		return "unknown"
	}
	if health == 3 || errorState.MatchString(status) {
		return "error"
	}
	if runningState.MatchString(status) {
		return "running"
	}
	if offlineState.MatchString(status) {
		return "offline"
	}
	return "unknown"
}
func (m *Manager) collected(ctx context.Context, configs []ServiceConfig) map[string]string {
	result := map[string]string{}
	if m.DB == nil {
		return result
	}
	var id, status string
	if m.DB.QueryRowContext(ctx, "SELECT id,status FROM systems WHERE name=?", "Cwl-Server").Scan(&id, &status) != nil {
		return result
	}
	rows, err := m.DB.QueryContext(ctx, "SELECT name,status,health,updated FROM containers WHERE system=?", id)
	if err != nil {
		return result
	}
	defer rows.Close()
	for rows.Next() {
		var name, state string
		var health int
		var updated int64
		if rows.Scan(&name, &state, &health, &updated) != nil {
			continue
		}
		result[name] = ContainerState(status, state, health, updated, time.Now())
	}
	if status == "down" {
		for _, d := range configs {
			result[d.Container] = "offline"
		}
	}
	return result
}
func integrationTarget(d definition, values map[string]any) string {
	fallback, _ := url.Parse(d.target)
	key := "api." + d.id + ".url"
	if d.id == "openlist" {
		key = "openlist.url"
	}
	base := strings.TrimRight(option(values, key, fallback.Scheme+"://"+fallback.Host), "/")
	if d.id == "napcat" {
		base = strings.TrimSuffix(base, "/api")
	}
	if d.id == "fontinass" {
		return option(values, "api.fontinass.health", d.target)
	}
	return base + fallback.Path
}
func (m *Manager) probe(ctx context.Context, cfg ServiceConfig, values map[string]any) Service {
	result := Service{ID: cfg.ID, Name: cfg.Name, State: "offline", Source: "direct", Icon: cfg.displayIcon()}
	target := cfg.URL
	if cfg.Integration != "" {
		target = ""
		for _, d := range definitions {
			if d.id == cfg.Integration {
				target = integrationTarget(d, values)
				break
			}
		}
	}
	if target == "" {
		result.State = "error"
		return result
	}
	ctx, cancel := context.WithTimeout(ctx, 2200*time.Millisecond)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return result
	}
	if cfg.CredentialID != "" {
		if m.Registry == nil || m.Registry.Authorize(ctx, cfg.CredentialID, request) != nil {
			result.State = "error"
			return result
		}
	}
	response, err := m.client().Do(request)
	if err != nil {
		return result
	}
	response.Body.Close()
	if cfg.Strict {
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			result.State = "running"
		} else {
			result.State = "error"
		}
	} else if response.StatusCode >= 500 {
		result.State = "error"
	} else {
		result.State = "reachable"
	}
	return result
}
func (m *Manager) Services(ctx context.Context) ([]Service, error) {
	m.servicesMu.Lock()
	defer m.servicesMu.Unlock()
	if time.Now().Before(m.servicesUntil) {
		return append([]Service{}, m.servicesValue...), nil
	}
	values, err := m.Settings(ctx)
	if err != nil {
		return nil, err
	}
	if m.Registry == nil {
		return nil, errors.New("服务列表未配置")
	}
	configs, err := m.Registry.Services(ctx, true)
	if err != nil {
		return nil, err
	}
	services := make([]Service, len(configs))
	if len(configs) == 0 {
		m.servicesValue = services
		m.servicesUntil = time.Now().Add(30 * time.Second)
		return services, nil
	}
	needsBeszel := false
	for _, cfg := range configs {
		if cfg.Container != "" {
			needsBeszel = true
			break
		}
	}
	beszel := Service{State: "unknown"}
	known := map[string]string{}
	if needsBeszel {
		beszel = m.probe(ctx, ServiceConfig{ID: "beszel", Name: "Beszel", Integration: "beszel", Strict: true}, values)
		if beszel.State == "running" {
			known = m.collected(ctx, configs)
		}
	}
	type answer struct {
		index int
		value Service
	}
	results := make(chan answer, len(configs))
	jobs := make(chan int, len(configs))
	count := 0
	for i, cfg := range configs {
		if cfg.Integration == "beszel" && cfg.CredentialID == "" && needsBeszel {
			service := beszel
			service.ID = cfg.ID
			service.Name = cfg.Name
			service.Icon = cfg.displayIcon()
			services[i] = service
			continue
		}
		if cfg.Container != "" {
			if state := known[cfg.Container]; state != "" && state != "unknown" {
				services[i] = Service{ID: cfg.ID, Name: cfg.Name, State: state, Source: "beszel", Icon: cfg.displayIcon()}
				continue
			}
		}
		jobs <- i
		count++
	}
	close(jobs)
	for worker := 0; worker < min(8, count); worker++ {
		go func() {
			for i := range jobs {
				results <- answer{i, m.probe(ctx, configs[i], values)}
			}
		}()
	}
	for i := 0; i < count; i++ {
		value := <-results
		services[value.index] = value.value
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	for i, service := range services {
		if service.State == "offline" || service.State == "error" {
			level := "error"
			if configs[i].Integration == "" {
				level = "warning"
			}
			alerts.Emit(alerts.Event{Kind: "service", Level: level, Source: service.Name, Title: "服务探测异常", Message: "既有服务检测未通过：" + service.State, Target: configs[i].URL})
		}
	}
	m.servicesValue = services
	m.servicesUntil = time.Now().Add(30 * time.Second)
	return append([]Service{}, services...), nil
}

func (m *Manager) InvalidateServices() {
	m.servicesMu.Lock()
	defer m.servicesMu.Unlock()
	m.servicesUntil = time.Time{}
	m.servicesValue = nil
}
