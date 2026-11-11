package jellyfin

import (
	"context"
	"errors"
	"io"
	"net/url"
	"strconv"
	"strings"
	"sync"
)

func ResumeSegment(playlist string, position float64) string {
	start, duration := float64(0), float64(0)
	last := ""
	for _, value := range strings.Split(playlist, "\n") {
		line := strings.TrimSpace(value)
		if strings.HasPrefix(line, "#EXTINF:") {
			duration, _ = strconv.ParseFloat(strings.Split(strings.TrimPrefix(line, "#EXTINF:"), ",")[0], 64)
		} else if line != "" && !strings.HasPrefix(line, "#") && finite(duration) && duration > 0 {
			last = line
			if position < start+duration {
				return line
			}
			start += duration
			duration = 0
		}
	}
	return last
}

type fragment struct {
	playlist, previous string
	sequence           int
}
type barrier struct {
	done chan struct{}
	err  error
}
type prerollState struct {
	last    *int
	pending *barrier
}
type Preroll struct {
	mu        sync.Mutex
	fragments map[string]fragment
	states    map[string]*prerollState
	Warm      func(context.Context, string) error
}

func (p *Preroll) Register(manifest, playlistURL string) error {
	if !strings.Contains(manifest, "#EXT-X-MAP:") {
		return nil
	}
	base, err := url.Parse(playlistURL)
	if err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.fragments == nil {
		p.fragments = map[string]fragment{}
	}
	media := false
	previous := ""
	sequence := 0
	for _, value := range strings.Split(manifest, "\n") {
		line := strings.TrimSpace(value)
		if strings.HasPrefix(line, "#EXTINF:") {
			media = true
		} else if media && line != "" && !strings.HasPrefix(line, "#") {
			relative, err := url.Parse(line)
			if err != nil {
				return err
			}
			target := base.ResolveReference(relative).String()
			p.fragments[target] = fragment{playlist: playlistURL, sequence: sequence, previous: previous}
			sequence++
			previous = target
			media = false
		}
	}
	return nil
}
func waitBarrier(ctx context.Context, b *barrier) error {
	if b == nil {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-b.done:
		return b.err
	}
}
func (p *Preroll) Before(ctx context.Context, target string) error {
	p.mu.Lock()
	f, known := p.fragments[target]
	if !known {
		p.mu.Unlock()
		return nil
	}
	if p.states == nil {
		p.states = map[string]*prerollState{}
	}
	state := p.states[f.playlist]
	if state == nil {
		state = &prerollState{}
		p.states[f.playlist] = state
	}
	jump := state.last == nil || f.sequence < *state.last || f.sequence > *state.last+1
	sequence := f.sequence
	state.last = &sequence
	previous := state.pending
	if !jump || f.previous == "" {
		p.mu.Unlock()
		return waitBarrier(ctx, previous)
	}
	current := &barrier{done: make(chan struct{})}
	state.pending = current
	p.mu.Unlock()
	// A failed predecessor can be retried on a later discontinuity. Every request
	// for contiguous fragments waits on the same preparation barrier.
	_ = waitBarrier(ctx, previous)
	var err error
	if ctx.Err() != nil {
		err = ctx.Err()
	} else if p.Warm == nil {
		err = errors.New("missing HLS fragment preparer")
	} else {
		err = p.Warm(ctx, f.previous)
	}
	p.mu.Lock()
	current.err = err
	if err != nil && state.pending == current {
		state.pending = nil
		state.last = nil
	}
	close(current.done)
	p.mu.Unlock()
	return err
}

type ReadMedia func(context.Context, *url.URL) (io.ReadCloser, error)

func readManifest(ctx context.Context, read ReadMedia, target *url.URL) (string, error) {
	body, err := read(ctx, target)
	if err != nil {
		return "", err
	}
	defer body.Close()
	raw, err := io.ReadAll(io.LimitReader(body, 4<<20+1))
	if err != nil {
		return "", err
	}
	if len(raw) > 4<<20 {
		return "", errors.New("视频清单过大")
	}
	return decodedText(raw), nil
}
func PrepareHLS(ctx context.Context, source *url.URL, position float64, read ReadMedia, preroll *Preroll) error {
	manifest, err := readManifest(ctx, read, source)
	if err != nil {
		return err
	}
	playlist, playlistURL := manifest, source
	if !strings.Contains(manifest, "#EXTINF:") {
		variant := ""
		for _, line := range strings.Split(manifest, "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "#") {
				variant = line
				break
			}
		}
		if variant == "" {
			return errors.New("Jellyfin 未提供可用的视频清单")
		}
		relative, err := url.Parse(variant)
		if err != nil {
			return err
		}
		playlistURL = source.ResolveReference(relative)
		playlist, err = readManifest(ctx, read, playlistURL)
		if err != nil {
			return err
		}
	}
	if err = preroll.Register(playlist, playlistURL.String()); err != nil {
		return err
	}
	if !finite(position) || position < 0 {
		position = 0
	}
	segment := ResumeSegment(playlist, position)
	if segment == "" {
		return errors.New("Jellyfin 未提供可用的视频片段")
	}
	relative, err := url.Parse(segment)
	if err != nil {
		return err
	}
	target := playlistURL.ResolveReference(relative)
	if err = preroll.Before(ctx, target.String()); err != nil {
		return err
	}
	response, err := read(ctx, target)
	if err != nil {
		return err
	}
	defer response.Close()
	_, err = io.Copy(io.Discard, response)
	return err
}
