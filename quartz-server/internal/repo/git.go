package repo

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
)

const MaxText = 2 * 1024 * 1024

type Problem struct {
	Message string
	Status  int
}

func (e *Problem) Error() string             { return e.Message }
func problem(code int, message string) error { return &Problem{message, code} }

var namePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
var shaPattern = regexp.MustCompile(`^[a-f0-9]{40,64}$`)

func SafePath(value string) (string, error) {
	if strings.HasPrefix(value, "/") || strings.ContainsAny(value, "\x00\\") {
		return "", problem(400, "无效的文件路径")
	}
	for _, part := range strings.Split(value, "/") {
		if part == "." || part == ".." {
			return "", problem(400, "无效的文件路径")
		}
	}
	return strings.TrimRight(value, "/"), nil
}
func gitCommand(ctx context.Context, directory string, args ...string) *exec.Cmd {
	all := append([]string{"-c", "safe.directory=" + directory, "--git-dir=" + directory}, args...)
	cmd := exec.CommandContext(ctx, "git", all...)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null")
	cmd.Stderr = io.Discard
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if errors.Is(err, syscall.ESRCH) {
			return os.ErrProcessDone
		}
		return err
	}
	cmd.WaitDelay = time.Second
	return cmd
}
func Git(ctx context.Context, directory string, limit int, allowed []int, args ...string) ([]byte, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case gitSlots <- struct{}{}:
		defer func() { <-gitSlots }()
	case <-ctx.Done():
		return nil, false, ctx.Err()
	case <-timer.C:
		return nil, false, problem(429, "请求较多，请稍后重试")
	}
	cmd := gitCommand(ctx, directory, args...)
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, false, err
	}
	if err = cmd.Start(); err != nil {
		return nil, false, err
	}
	data, readErr := io.ReadAll(io.LimitReader(pipe, int64(limit)+1))
	truncated := len(data) > limit
	if truncated {
		cancel()
	}
	waitErr := cmd.Wait()
	if readErr != nil {
		return nil, false, readErr
	}
	if truncated {
		return data[:limit], true, nil
	}
	if ctx.Err() != nil {
		return nil, false, problem(504, "仓库数据读取超时，请重试")
	}
	if waitErr != nil {
		exit := &exec.ExitError{}
		if !errors.As(waitErr, &exit) {
			return nil, false, waitErr
		}
		ok := false
		for _, code := range allowed {
			if code == exit.ExitCode() {
				ok = true
			}
		}
		if !ok {
			return nil, false, problem(404, "指定分支、文件或提交不存在")
		}
	}
	return data, false, nil
}
func Resolve(ctx context.Context, directory, ref string) (string, error) {
	if ref == "" || len(ref) > 256 || strings.HasPrefix(ref, "-") || strings.ContainsRune(ref, 0) {
		return "", problem(400, "无效的分支或提交")
	}
	raw, _, err := Git(ctx, directory, 100, nil, "rev-parse", "--verify", "--end-of-options", ref+"^{commit}")
	if err != nil {
		return "", err
	}
	sha := strings.TrimSpace(string(raw))
	if !shaPattern.MatchString(sha) {
		return "", problem(404, "无效的提交")
	}
	return sha, nil
}
func confined(root, name string) (string, error) {
	if !namePattern.MatchString(name) || name == "." || name == ".." {
		return "", problem(404, "仓库不存在")
	}
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", problem(503, "仓库正在同步")
	}
	target, err := filepath.EvalSymlinks(filepath.Join(root, strings.ToLower(name)+".git"))
	if err != nil {
		return "", problem(503, "仓库正在同步")
	}
	relative, err := filepath.Rel(root, target)
	if err != nil || !filepath.IsLocal(relative) {
		return "", problem(404, "仓库不存在")
	}
	info, err := os.Stat(target)
	if err != nil || !info.IsDir() {
		return "", problem(503, "仓库正在同步")
	}
	return target, nil
}

var gitSlots = make(chan struct{}, 4)
