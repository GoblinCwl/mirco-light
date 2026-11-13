package friendavatar

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const DefaultTargetKiB = 256

var compressionSlots = make(chan struct{}, 2)

// Compress retains small originals; larger images become bounded WebP animations/stills.
// The source download hash is not used: callers address the final uploaded bytes.
func Compress(ctx context.Context, data []byte, targetKiB int) ([]byte, string, string, error) {
	mime, ext, err := MIME(data)
	if err != nil {
		return nil, "", "", err
	}
	if targetKiB < 32 || targetKiB > 1024 {
		return nil, "", "", errors.New("头像目标大小须为 32–1024 KiB")
	}
	target := targetKiB * 1024
	if cfg, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil && cfg.Width <= 256 && cfg.Height <= 256 && len(data) <= target {
		return data, mime, ext, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	select {
	case compressionSlots <- struct{}{}:
		defer func() { <-compressionSlots }()
	case <-ctx.Done():
		return nil, "", "", ctx.Err()
	}
	dir, err := os.MkdirTemp("", "friend-avatar-")
	if err != nil {
		return nil, "", "", err
	}
	defer os.RemoveAll(dir)
	input := filepath.Join(dir, "source."+ext)
	if err = os.WriteFile(input, data, 0600); err != nil {
		return nil, "", "", err
	}
	coder := map[string]string{"png": "png", "jpg": "jpeg", "gif": "gif", "webp": "webp", "avif": "avif"}[ext]
	if ext == "png" && apngFrames(data) > 0 {
		coder = "apng"
	}
	source := coder + ":" + input
	limits := []string{"-limit", "thread", "1", "-limit", "memory", "128MiB", "-limit", "map", "256MiB", "-limit", "disk", "256MiB", "-limit", "width", "4096", "-limit", "height", "4096", "-limit", "list-length", "400"}
	probe := append([]string{"identify"}, limits...)
	probe = append(probe, "-ping", "-format", "%n %w %h\n", source)
	raw, err := avatarCommand(ctx, probe...).Output()
	if err != nil {
		return nil, "", "", errors.New("头像解析失败，保留现有头像并等待重试")
	}
	fields := strings.Fields(string(raw))
	if len(fields) < 3 {
		return nil, "", "", errors.New("头像尺寸无效")
	}
	frames, err := strconv.Atoi(fields[0])
	if err != nil || frames < 1 || frames > 400 {
		return nil, "", "", errors.New("头像动画帧数超过处理范围")
	}
	if expected := apngFrames(data); expected > 0 && frames != expected {
		return nil, "", "", errors.New("动态 PNG 帧解析不完整")
	}
	width, _ := strconv.Atoi(fields[1])
	height, _ := strconv.Atoi(fields[2])
	if width <= 256 && height <= 256 && len(data) <= target {
		return data, mime, ext, nil
	}
	output := filepath.Join(dir, "avatar.webp")
	attempts := []struct{ size, quality int }{{256, 82}, {256, 65}, {192, 65}, {128, 55}, {96, 45}, {64, 40}}
	for _, attempt := range attempts {
		if err := ctx.Err(); err != nil {
			return nil, "", "", err
		}
		args := append([]string{}, limits...)
		args = append(args, source, "-coalesce", "-auto-orient", "-resize", fmt.Sprintf("%dx%d>", attempt.size, attempt.size), "-strip", "-quality", strconv.Itoa(attempt.quality), "-define", "webp:method=4", output)
		if err = avatarCommand(ctx, args...).Run(); err != nil {
			return nil, "", "", errors.New("头像压缩失败，保留现有头像并等待重试")
		}
		info, err := os.Stat(output)
		if err != nil {
			return nil, "", "", err
		}
		if info.Size() > int64(target) {
			continue
		}
		result, err := os.ReadFile(output)
		if err != nil {
			return nil, "", "", err
		}
		if _, ext, err := MIME(result); err != nil || ext != "webp" {
			return nil, "", "", errors.New("头像压缩结果无效")
		}
		if frames > 1 && webpFrames(result) != frames {
			return nil, "", "", errors.New("头像压缩未完整保留动画")
		}
		if len(data) <= target && len(result) >= len(data) && width <= 256 && height <= 256 {
			return data, mime, ext, nil
		}
		return result, "image/webp", "webp", nil
	}
	return nil, "", "", errors.New("头像无法压缩到目标大小，请提高头像目标大小配置")
}

func apngFrames(data []byte) int {
	if len(data) < 8 || !bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")) {
		return 0
	}
	for pos := 8; pos+12 <= len(data); {
		size := int(binary.BigEndian.Uint32(data[pos : pos+4]))
		if size > len(data)-pos-12 {
			return 0
		}
		if string(data[pos+4:pos+8]) == "acTL" && size == 8 {
			return int(binary.BigEndian.Uint32(data[pos+8 : pos+12]))
		}
		pos += size + 12
	}
	return 0
}
func webpFrames(data []byte) int {
	count := 0
	for pos := 12; pos+8 <= len(data); {
		size := int(binary.LittleEndian.Uint32(data[pos+4 : pos+8]))
		if size > len(data)-pos-8 {
			return 0
		}
		if string(data[pos:pos+4]) == "ANMF" {
			count++
		}
		pos += 8 + size + (size % 2)
	}
	return count
}

// APNG decoding may delegate to FFmpeg; cancellation must also stop that child.
func avatarCommand(ctx context.Context, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, "magick", args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	cmd.WaitDelay = 2 * time.Second
	return cmd
}
