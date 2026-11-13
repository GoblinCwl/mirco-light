package observer

import (
	"context"
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/taskruns"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type Definition struct {
	Name string
	Port int
	Path string
}

var Services = map[string]Definition{
	"quartz4": {"博客构建服务", 0, ""}, "quartz-server": {"星枢", 8080, "/health/ready"},
	"artalk": {"Artalk", 23366, "/api/v2/conf"}, "openlist": {"OpenList", 5244, "/api/public/settings"}, "danmu-api": {"DanmuApi", 9321, "/"}, "jellyfin": {"Jellyfin", 8096, "/health"}, "fontinass": {"Fontinass", 8011, "/"}, "syncthing": {"Syncthing", 8384, "/rest/noauth/health"}, "beszel": {"Beszel", 8090, "/api/health"}, "gitea": {"Gitea", 3000, "/api/v1/version"}, "astrbot": {"AstrBot", 6185, "/"}, "napcat": {"NapCat", 6099, "/"},
}

type State struct {
	Status         string `json:"status,omitempty"`
	FailureSamples int    `json:"failureSamples,omitempty"`
	Key            string `json:"key"`
	ID             string `json:"id"`
	Pending        bool   `json:"pending"`
	Recreated      bool   `json:"recreated,omitempty"`
}
type Event struct {
	ID          string `json:"id"`
	CompletedAt string `json:"completedAt"`
	Service     string `json:"service"`
	Operation   string `json:"operation"`
}
type Failure struct {
	ID         string `json:"id"`
	Service    string `json:"service"`
	Status     string `json:"status"`
	ObservedAt string `json:"observedAt"`
}
type Snapshot struct {
	TaskRuns []taskruns.RunRecord `json:"taskRuns,omitempty"`
	Failures []Failure            `json:"failures,omitempty"`
	States   map[string]State     `json:"states"`
	Events   []Event              `json:"events"`
}
type Container struct {
	ID    string `json:"Id"`
	Name  string `json:"Name"`
	State struct {
		Running    bool
		Restarting bool
		StartedAt  string
		Health     *struct{ Status string }
	}
	NetworkSettings struct {
		Networks map[string]struct{ IPAddress string }
	}
}

func Read(path string) (Snapshot, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Snapshot{}, err
	}
	var snapshot Snapshot
	if err = json.Unmarshal(raw, &snapshot); err != nil {
		return snapshot, err
	}
	if snapshot.States == nil {
		return snapshot, errors.New("observer state invalid")
	}
	if snapshot.Events == nil {
		snapshot.Events = []Event{}
	}
	return snapshot, nil
}
func Save(path string, snapshot Snapshot) error {
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".observer-*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err = file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	_, writeErr := file.Write(raw)
	syncErr := file.Sync()
	closeErr := file.Close()
	if err = errors.Join(writeErr, syncErr, closeErr); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}
func Inspect(ctx context.Context) ([]Container, error) {
	names := []string{}
	for name := range Services {
		names = append(names, name)
	}
	sort.Strings(names)
	args := append([]string{"inspect"}, names...)
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "docker", args...)
	command.Stderr = io.Discard
	raw, err := command.Output()
	if len(raw) > 4<<20 {
		return nil, errors.New("container status too large")
	}
	var containers []Container
	if parseErr := json.Unmarshal(raw, &containers); parseErr != nil {
		return nil, errors.New("container inspection unavailable")
	}
	if len(containers) == 0 && err != nil {
		return nil, errors.New("container inspection unavailable")
	}
	return containers, nil
}
func Ready(ctx context.Context, container Container, directory string) bool {
	if !container.State.Running || container.State.Health != nil && container.State.Health.Status != "healthy" {
		return false
	}
	name := strings.TrimPrefix(container.Name, "/")
	definition, ok := Services[name]
	if !ok {
		return false
	}
	if name == "quartz4" {
		raw, err := os.ReadFile(filepath.Join(directory, "build-state.json"))
		if err != nil {
			return false
		}
		var state struct {
			CompletedAt string `json:"completedAt"`
		}
		if json.Unmarshal(raw, &state) != nil {
			return false
		}
		completed, err := time.Parse(time.RFC3339Nano, state.CompletedAt)
		if err != nil {
			return false
		}
		started, err := time.Parse(time.RFC3339Nano, container.State.StartedAt)
		return err == nil && !completed.Before(started)
	}
	networks := []string{}
	for name := range container.NetworkSettings.Networks {
		networks = append(networks, name)
	}
	sort.Slice(networks, func(i, j int) bool {
		if networks[i] == networks[j] {
			return false
		}
		if networks[i] == "service_net" {
			return true
		}
		if networks[j] == "service_net" {
			return false
		}
		return networks[i] < networks[j]
	})
	client := &http.Client{Transport: &http.Transport{Proxy: nil}, Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	for _, network := range networks {
		address := container.NetworkSettings.Networks[network].IPAddress
		if address == "" {
			continue
		}
		request, err := http.NewRequestWithContext(ctx, "GET", "http://"+address+":"+strconv.Itoa(definition.Port)+definition.Path, nil)
		if err != nil {
			continue
		}
		response, err := client.Do(request)
		if err != nil {
			continue
		}
		response.Body.Close()
		if response.StatusCode < 500 {
			return true
		}
	}
	return false
}
func Update(snapshot *Snapshot, containers []Container, baseline bool, ready func(Container) bool, now time.Time) {
	if snapshot.States == nil {
		snapshot.States = map[string]State{}
	}
	if snapshot.Events == nil {
		snapshot.Events = []Event{}
	}
	for _, container := range containers {
		name := strings.TrimPrefix(container.Name, "/")
		definition, ok := Services[name]
		if !ok {
			continue
		}
		key := container.ID + ":" + container.State.StartedAt
		before, exists := snapshot.States[name]
		if baseline {
			state := State{Key: key, ID: container.ID}
			trackFailure(snapshot, &state, before, container, definition.Name, key, now)
			snapshot.States[name] = state
			continue
		}
		state := before
		if !exists || before.Key != key {
			state = State{Key: key, ID: container.ID, Pending: true, Recreated: exists && before.ID != container.ID}
		}
		if state.Pending && ready(container) {
			operation := "restart"
			if state.Recreated {
				operation = "recreate"
			}
			snapshot.Events = append(snapshot.Events, Event{ID: "service:" + key, CompletedAt: now.UTC().Format("2006-01-02T15:04:05.000Z"), Service: definition.Name, Operation: operation})
			if len(snapshot.Events) > 10 {
				snapshot.Events = snapshot.Events[len(snapshot.Events)-10:]
			}
			state.Pending = false
		}
		trackFailure(snapshot, &state, before, container, definition.Name, key, now)
		snapshot.States[name] = state
	}
}

// Reuse the existing ten-second inspection. Two consecutive abnormal samples
// avoid recording the normal short gap during container recreation as an outage.
func trackFailure(snapshot *Snapshot, state *State, before State, container Container, name, key string, now time.Time) {
	status := "running"
	if container.State.Restarting {
		status = "restarting"
	} else if !container.State.Running {
		status = "offline"
	} else if container.State.Health != nil && container.State.Health.Status == "unhealthy" {
		status = "unhealthy"
	}
	state.Status = status
	state.FailureSamples = 0
	if status == "running" {
		return
	}
	state.FailureSamples = 1
	if before.Status != "" && before.Status != "running" {
		state.FailureSamples = min(3, before.FailureSamples+1)
	}
	if state.FailureSamples != 2 {
		return
	}
	at := now.UTC().Format("2006-01-02T15:04:05.000Z")
	snapshot.Failures = append(snapshot.Failures, Failure{ID: "failure:" + key + ":" + at, Service: name, Status: status, ObservedAt: at})
	if len(snapshot.Failures) > 128 {
		snapshot.Failures = snapshot.Failures[len(snapshot.Failures)-128:]
	}
}
