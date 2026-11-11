package observer

import (
	"path/filepath"
	"testing"
	"time"
)

func TestBaselinePendingHealthAndRecreation(t *testing.T) {
	snapshot := Snapshot{}
	now := time.Now()
	container := Container{ID: "first", Name: "/openlist"}
	container.State.StartedAt = now.Format(time.RFC3339Nano)
	Update(&snapshot, []Container{container}, true, func(Container) bool { return true }, now)
	if len(snapshot.Events) != 0 {
		t.Fatal("initial deployment falsely reported")
	}
	container.ID = "second"
	Update(&snapshot, []Container{container}, false, func(Container) bool { return false }, now)
	if !snapshot.States["openlist"].Pending || len(snapshot.Events) != 0 {
		t.Fatal("unhealthy restart was reported")
	}
	Update(&snapshot, []Container{container}, false, func(Container) bool { return true }, now)
	if len(snapshot.Events) != 1 || snapshot.Events[0].Operation != "recreate" {
		t.Fatal(snapshot)
	}
	Update(&snapshot, []Container{container}, false, func(Container) bool { return true }, now)
	if len(snapshot.Events) != 1 {
		t.Fatal("duplicate lifecycle event")
	}
	filename := filepath.Join(t.TempDir(), "observer.json")
	if err := Save(filename, snapshot); err != nil {
		t.Fatal(err)
	}
	restored, err := Read(filename)
	if err != nil || len(restored.Events) != 1 || restored.States["openlist"].Pending {
		t.Fatal(restored, err)
	}
}

func TestAbnormalStatusUsesExistingSamplesAndIgnoresShortRestarts(t *testing.T) {
	snapshot := Snapshot{}
	now := time.Now()
	container := Container{ID: "first", Name: "/openlist"}
	container.State.Running = true
	Update(&snapshot, []Container{container}, true, func(Container) bool { return true }, now)
	container.State.Running = false
	Update(&snapshot, []Container{container}, false, func(Container) bool { return false }, now.Add(10*time.Second))
	if len(snapshot.Failures) != 0 {
		t.Fatal("single abnormal sample was reported")
	}
	container.State.Running = true
	Update(&snapshot, []Container{container}, false, func(Container) bool { return true }, now.Add(20*time.Second))
	if len(snapshot.Failures) != 0 {
		t.Fatal("short restart was reported")
	}
	container.State.Running = false
	for _, seconds := range []int{30, 40, 50, 60} {
		Update(&snapshot, []Container{container}, false, func(Container) bool { return false }, now.Add(time.Duration(seconds)*time.Second))
	}
	if len(snapshot.Failures) != 1 || snapshot.Failures[0].Status != "offline" {
		t.Fatal("persistent outage missing or duplicated", snapshot.Failures)
	}
	container.State.Running = true
	Update(&snapshot, []Container{container}, false, func(Container) bool { return true }, now.Add(70*time.Second))
	container.State.Running = false
	for _, seconds := range []int{80, 90} {
		Update(&snapshot, []Container{container}, false, func(Container) bool { return false }, now.Add(time.Duration(seconds)*time.Second))
	}
	if len(snapshot.Failures) != 2 {
		t.Fatal("new outage not recorded", snapshot.Failures)
	}
}

func TestConsecutiveDifferentFailureStatesStillCountAsOutage(t *testing.T) {
	snapshot := Snapshot{}
	container := Container{ID: "fixture", Name: "/openlist"}
	container.State.Running = true
	now := time.Now()
	Update(&snapshot, []Container{container}, true, func(Container) bool { return true }, now)
	container.State.Running = false
	Update(&snapshot, []Container{container}, false, func(Container) bool { return false }, now.Add(10*time.Second))
	container.State.Restarting = true
	Update(&snapshot, []Container{container}, false, func(Container) bool { return false }, now.Add(20*time.Second))
	if len(snapshot.Failures) != 1 || snapshot.Failures[0].Status != "restarting" {
		t.Fatal("mixed abnormal samples missed", snapshot.Failures)
	}
}
