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
	return r.projectToken(ctx, "github", r.options.GitHubMirrorTokenFile)
}
func (r *Runtime) projectMirrorTokens(ctx context.Context) error {
	return errors.Join(r.projectGitHubToken(ctx), r.projectToken(ctx, "gitea", r.options.GiteaMirrorTokenFile))
}
func (r *Runtime) projectToken(ctx context.Context, id, filename string) error {
	if filename == "" {
		return nil
	}
	token, err := r.app.Credentials.Read(ctx, id)
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
	file, err := os.CreateTemp(filepath.Dir(filename), "."+id+"-token-*")
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

// Only bootstrap from the legacy file when no encrypted database value exists.
func (r *Runtime) importGiteaToken(ctx context.Context) error {
	state, err := r.app.Credentials.Describe(ctx, "gitea")
	if err != nil {
		return err
	}
	if state["configured"] == true || r.options.GiteaMirrorTokenFile == "" {
		return nil
	}
	raw, err := os.ReadFile(r.options.GiteaMirrorTokenFile)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(raw)) == "" {
		return nil
	}
	return r.app.Credentials.Import(ctx, "gitea", strings.TrimSpace(string(raw)))
}
