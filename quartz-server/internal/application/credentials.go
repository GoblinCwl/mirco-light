package application

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// The independent Gitea mirror producer still consumes its own restricted token
// file. MySQL remains authoritative; this is an output for that external job,
// never a second configuration source for quartz-server.
func (r *Runtime) projectGitHubToken(ctx context.Context) error {
	filename := r.options.GitHubMirrorTokenFile
	if filename == "" {
		return nil
	}
	token, err := r.app.Credentials.Read(ctx, "github")
	if err != nil {
		return err
	}
	if token == "" {
		err := os.Remove(filename)
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	existing, err := os.ReadFile(filename)
	if err == nil && strings.TrimSpace(string(existing)) == token {
		return nil
	}
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(filename), ".github-token-*")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if err = file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	_, writeErr := file.WriteString(token + "\n")
	syncErr := file.Sync()
	closeErr := file.Close()
	if err = errors.Join(writeErr, syncErr, closeErr); err != nil {
		return err
	}
	return os.Rename(name, filename)
}
