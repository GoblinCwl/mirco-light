package buildcontrol

import (
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// Private Unix socket only: no caller-supplied file paths or payloads and no
// registration on the public HTTP server.
func ListenPublished(path string, notify func()) (*http.Server, net.Listener, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, nil, err
	}
	if info, err := os.Lstat(path); err == nil {
		if info.Mode()&os.ModeSocket == 0 {
			return nil, nil, errors.New("build event path is not a socket")
		}
		if err = os.Remove(path); err != nil {
			return nil, nil, err
		}
	} else if !os.IsNotExist(err) {
		return nil, nil, err
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		return nil, nil, err
	}
	if err = os.Chmod(path, 0660); err != nil {
		listener.Close()
		return nil, nil, err
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/published" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		notify()
		w.WriteHeader(http.StatusAccepted)
	})
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, MaxHeaderBytes: 4096}
	return server, listener, nil
}
