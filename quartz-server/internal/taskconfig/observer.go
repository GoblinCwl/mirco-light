package taskconfig

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// WriteObserver shares only a non-secret task period with the host observer.
func WriteObserver(filename string, interval time.Duration) error {
	if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
		return err
	}
	raw, err := json.Marshal(map[string]int64{"intervalSeconds": int64(interval / time.Second)})
	if err != nil {
		return err
	}
	if old, err := os.ReadFile(filename); err == nil && string(old) == string(raw) {
		return nil
	}
	file, err := os.CreateTemp(filepath.Dir(filename), ".tasks-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(raw); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), filename)
}
func ReadObserver(filename string) (float64, error) {
	raw, err := os.ReadFile(filename)
	if err != nil {
		return 0, err
	}
	var values struct {
		Seconds float64 `json:"intervalSeconds"`
	}
	if err = json.Unmarshal(raw, &values); err != nil {
		return 0, err
	}
	if values.Seconds < 1 || values.Seconds > 3600 || values.Seconds != float64(int(values.Seconds)) {
		return 0, errors.New("invalid observer interval")
	}
	return values.Seconds, nil
}
