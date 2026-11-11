package repo

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

func (a *Adapter) Download(w http.ResponseWriter, r *http.Request, name, action string) error {
	item, directory, err := a.Repository(r.Context(), name)
	if err != nil {
		return err
	}
	ref := r.URL.Query().Get("ref")
	if ref == "" {
		ref = stringValue(item["default_branch"])
		if ref == "" {
			ref = "HEAD"
		}
	}
	sha, err := Resolve(r.Context(), directory, ref)
	if err != nil {
		return err
	}
	if action == "raw" {
		filename, err := SafePath(r.URL.Query().Get("path"))
		if err != nil {
			return err
		}
		if filename == "" {
			return problem(400, "缺少文件路径")
		}
		data, truncated, err := Git(r.Context(), directory, 10*MaxText, nil, "cat-file", "blob", sha+":"+filename)
		if err != nil {
			return err
		}
		if truncated {
			return problem(413, "该文件过大，请下载仓库源码")
		}
		mime := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif"}[strings.ToLower(path.Ext(filename))]
		if mime == "" {
			mime = "application/octet-stream"
			w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(path.Base(filename)))
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("Cache-Control", "public, max-age=300")
		w.Header().Set("Content-Length", itoa(len(data)))
		_, err = w.Write(data)
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case gitSlots <- struct{}{}:
		defer func() { <-gitSlots }()
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return problem(429, "请求较多，请稍后重试")
	}
	repository := stringValue(item["name"])
	cmd := gitCommand(ctx, directory, "archive", "--format=zip", "--prefix="+repository+"/", sha)
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err = cmd.Start(); err != nil {
		return err
	}
	defer func() {
		if cmd.ProcessState == nil {
			cancel()
			cmd.Wait()
		}
	}()
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+repository+"-"+sha[:10]+`.zip"`)
	_, copyErr := io.Copy(w, pipe)
	if copyErr != nil {
		cancel()
	}
	waitErr := cmd.Wait()
	if copyErr != nil {
		return copyErr
	}
	return waitErr
}
