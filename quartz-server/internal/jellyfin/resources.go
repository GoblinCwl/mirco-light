package jellyfin

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func copyHeaders(destination http.Header, source http.Header) {
	for _, key := range []string{"Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
		if value := source.Get(key); value != "" {
			destination.Set(key, value)
		}
	}
}

var manifestURI = regexp.MustCompile(`URI="([^"]+)"`)

func (s *Service) Stream(w http.ResponseWriter, r *http.Request, sessionID, key string) error {
	s.mu.Lock()
	session := s.sessions[sessionID]
	target := ""
	if session != nil {
		target = session.Assets[key]
	}
	if target == "" || SessionExpired(session.Created, session.Touched, session.Active, time.Now()) {
		s.mu.Unlock()
		w.WriteHeader(404)
		return nil
	}
	session.Touched = time.Now()
	session.Active++
	s.mu.Unlock()
	defer func() { s.mu.Lock(); session.Active--; session.Touched = time.Now(); s.mu.Unlock() }()
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	detach := context.AfterFunc(session.Context, cancel)
	defer detach()
	if r.Method != "HEAD" {
		if err := session.Preroll.Before(ctx, target); err != nil {
			return err
		}
	}
	headers := make(http.Header)
	for _, key := range []string{"Range", "If-Range"} {
		if value := r.Header.Get(key); value != "" {
			headers.Set(key, value)
		}
	}
	response, err := s.fetch(ctx, target, r.Method, headers)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	kind := response.Header.Get("Content-Type")
	if kind == "" {
		kind = "application/octet-stream"
	}
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Cache-Control", "private, no-store")
	if r.Method == "HEAD" {
		copyHeaders(w.Header(), response.Header)
		w.WriteHeader(response.StatusCode)
		return nil
	}
	resource, _ := url.Parse(target)
	isManifest := strings.Contains(kind, "mpegurl") || strings.HasSuffix(resource.Path, ".m3u8")
	if isManifest && response.StatusCode >= 200 && response.StatusCode < 300 {
		raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20+1))
		if err != nil {
			return err
		}
		if len(raw) > 4<<20 {
			return errors.New("视频清单过大")
		}
		manifest := decodedText(raw)
		if err = session.Preroll.Register(manifest, target); err != nil {
			return err
		}
		var rewriteErr error
		rewrite := func(uri string) string {
			if rewriteErr != nil {
				return ""
			}
			relative, err := url.Parse(uri)
			if err != nil {
				rewriteErr = err
				return ""
			}
			value, err := s.asset(ctx, session, resource.ResolveReference(relative).String())
			if err != nil {
				rewriteErr = err
			}
			return value
		}
		lines := strings.Split(manifest, "\n")
		for i, line := range lines {
			if strings.HasPrefix(line, "#") {
				lines[i] = manifestURI.ReplaceAllStringFunc(line, func(match string) string {
					parts := manifestURI.FindStringSubmatch(match)
					return `URI="` + rewrite(parts[1]) + `"`
				})
			} else if strings.TrimSpace(line) != "" {
				lines[i] = rewrite(strings.TrimSpace(line))
			}
		}
		if rewriteErr != nil {
			return rewriteErr
		}
		manifest = strings.Join(lines, "\n")
		if session.NativeSubtitles {
			base, err := s.publicBase(ctx)
			if err != nil {
				return err
			}
			manifest = WithSubtitleRenditions(manifest, session.Subtitles, func(track map[string]any) string {
				uri := base + "subtitle/" + session.MatchID + "/" + numeric(number(track["index"])) + "/playlist.m3u8"
				if session.TS {
					uri += "?offset=10"
				}
				return uri
			})
		}
		w.WriteHeader(response.StatusCode)
		_, err = io.WriteString(w, manifest)
		return err
	}
	copyHeaders(w.Header(), response.Header)
	w.WriteHeader(response.StatusCode)
	if _, err = io.Copy(w, response.Body); err != nil {
		panic(http.ErrAbortHandler)
	}
	return nil
}
func (s *Service) ImageURL(ctx context.Context, item, tag string, access Access, kind string) (string, error) {
	key, err := opaqueID()
	if err != nil {
		return "", err
	}
	base, err := s.publicBase(ctx)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	if len(s.images) >= 10000 {
		for old := range s.images {
			delete(s.images, old)
			break
		}
	}
	s.images[key] = Image{Item: item, Tag: tag, Access: access, Kind: kind, At: time.Now()}
	s.mu.Unlock()
	return base + "image/" + key, nil
}
func (s *Service) ServeImage(w http.ResponseWriter, r *http.Request, key string) error {
	s.mu.Lock()
	image, ok := s.images[key]
	s.mu.Unlock()
	if !ok || time.Since(image.At) > 12*time.Hour {
		w.WriteHeader(404)
		return nil
	}
	if _, err := s.Backend.Authorize(r.Context(), image.Access, true); err != nil {
		return err
	}
	base, _, _, err := s.Backend.configuration(r.Context())
	if err != nil {
		return err
	}
	kind, width := "Primary", "480"
	if image.Kind == "Backdrop" {
		kind = "Backdrop/0"
		width = "1280"
	}
	target := base + "/Items/" + url.PathEscape(image.Item) + "/Images/" + kind + "?" + url.Values{"maxWidth": {width}, "quality": {"85"}, "tag": {image.Tag}}.Encode()
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	response, err := s.fetch(ctx, target, "GET", nil)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 || !strings.HasPrefix(response.Header.Get("Content-Type"), "image/") {
		w.WriteHeader(404)
		return nil
	}
	w.Header().Set("Content-Type", response.Header.Get("Content-Type"))
	w.Header().Set("Cache-Control", "private, max-age=300")
	if _, err = io.Copy(w, response.Body); err != nil {
		panic(http.ErrAbortHandler)
	}
	return nil
}
func (s *Service) BitrateTest(w http.ResponseWriter, r *http.Request, matchID, size string) error {
	bytes, err := strconv.Atoi(size)
	if err != nil || bytes != 500000 && bytes != 1000000 && bytes != 3000000 {
		return errors.New("无效的测速参数")
	}
	if _, err = s.match(r.Context(), matchID); err != nil {
		return err
	}
	base, _, _, err := s.Backend.configuration(r.Context())
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(r.Context(), 6*time.Second)
	defer cancel()
	response, err := s.fetch(ctx, base+"/Playback/BitrateTest?Size="+strconv.Itoa(bytes), "GET", nil)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	if length := response.Header.Get("Content-Length"); length != "" {
		w.Header().Set("Content-Length", length)
	}
	w.WriteHeader(response.StatusCode)
	if _, err = io.Copy(w, response.Body); err != nil {
		panic(http.ErrAbortHandler)
	}
	return nil
}

var assEvents = regexp.MustCompile(`(?mi)^\[Events\]`)

func (s *Service) loadSubtitle(match *Match, index, format, extension string) *subtitleLoad {
	key := index + ":" + extension
	match.subtitlesMu.Lock()
	defer match.subtitlesMu.Unlock()
	if match.subtitles == nil {
		match.subtitles = map[string]*subtitleLoad{}
	}
	if pending := match.subtitles[key]; pending != nil {
		return pending
	}
	pending := &subtitleLoad{done: make(chan struct{})}
	s.mu.Lock()
	if s.ctx.Err() != nil {
		s.mu.Unlock()
		pending.err = context.Canceled
		close(pending.done)
		return pending
	}
	s.jobs.Add(1)
	s.mu.Unlock()
	match.subtitles[key] = pending
	go func() {
		defer s.jobs.Done()
		defer close(pending.done)
		ctx, cancel := context.WithTimeout(s.ctx, 120*time.Second)
		defer cancel()
		values, err := s.Backend.Settings(ctx)
		if err == nil {
			base := text(values["api.fontinass.url"])
			if base == "" {
				base = "http://fontinass:8012"
			}
			target := strings.TrimRight(base, "/") + "/Videos/" + match.Item + "/" + url.PathEscape(text(match.Source["Id"])) + "/Subtitles/" + index + "/Stream." + extension
			var response *http.Response
			response, err = s.fetchUsing(ctx, target, "GET", nil, subtitleClient)
			if err == nil {
				defer response.Body.Close()
				if response.StatusCode < 200 || response.StatusCode >= 300 {
					err = errors.New("字幕读取失败")
				} else {
					var raw []byte
					raw, err = io.ReadAll(io.LimitReader(response.Body, 64<<20+1))
					if err == nil {
						if len(raw) > 64<<20 {
							err = errors.New("字幕内容过大")
						} else {
							pending.content = decodedText(raw)
							if format == "ass" && !assEvents.MatchString(pending.content) {
								err = errors.New("Fontinass 未返回有效的 ASS 字幕")
							} else if format != "ass" && !strings.HasPrefix(pending.content, "WEBVTT") {
								err = errors.New("Jellyfin 未返回有效的 WebVTT 字幕")
							} else if format != "ass" {
								pending.content = NormalizeTextSubtitle(pending.content)
							}
						}
					}
				}
			}
		}
		pending.err = err
		if err != nil {
			match.subtitlesMu.Lock()
			if match.subtitles[key] == pending {
				delete(match.subtitles, key)
			}
			match.subtitlesMu.Unlock()
		}
	}()
	return pending
}
func (s *Service) Subtitle(w http.ResponseWriter, r *http.Request, matchID, index, format string) error {
	switch format {
	case "ass", "vtt", "sup", "playlist.m3u8", "segment.vtt":
	default:
		return errors.New("字幕授权已失效")
	}
	match, err := s.match(r.Context(), matchID)
	if err != nil {
		return err
	}
	base, err := s.publicBase(r.Context())
	if err != nil {
		return err
	}
	var track map[string]any
	for _, candidate := range SubtitleOptions(matchID, match.Source, base) {
		if numeric(number(candidate["index"])) == index {
			track = candidate
			break
		}
	}
	if track == nil || (format == "sup") != (track["type"] == "pgs") || format == "ass" && track["type"] != "ass" {
		return errors.New("无效的字幕轨道")
	}
	offset := float64(0)
	if r.URL.Query().Get("offset") == "10" {
		offset = 10
	}
	if format == "playlist.m3u8" {
		uri := base + "subtitle/" + matchID + "/" + index + "/segment.vtt"
		if offset == 10 {
			uri += "?offset=10"
		}
		w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
		w.Header().Set("Cache-Control", "private, no-store")
		if r.Method != "HEAD" {
			_, err = io.WriteString(w, SubtitlePlaylist(number(match.Source["RunTimeTicks"])/10000000, uri))
		}
		return err
	}
	if format == "sup" {
		values, err := s.Backend.Settings(r.Context())
		if err != nil {
			return err
		}
		base := text(values["api.fontinass.url"])
		if base == "" {
			base = "http://fontinass:8012"
		}
		target := strings.TrimRight(base, "/") + "/Videos/" + match.Item + "/" + url.PathEscape(text(match.Source["Id"])) + "/Subtitles/" + index + "/0/Stream.pgssub"
		ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
		defer cancel()
		response, err := s.fetchUsing(ctx, target, r.Method, nil, subtitleClient)
		if err != nil {
			return err
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return errors.New("PGS 字幕读取失败")
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "private, max-age=300")
		if r.Method != "HEAD" {
			if _, err = io.Copy(w, response.Body); err != nil {
				panic(http.ErrAbortHandler)
			}
		}
		return nil
	}
	extension := "vtt"
	if format == "ass" {
		for _, raw := range list(match.Source["MediaStreams"]) {
			stream := object(raw)
			if stream["Type"] == "Subtitle" && numeric(number(stream["Index"])) == index {
				if delivery := TextDelivery(text(stream["Codec"]), false); delivery != nil {
					extension = delivery.Extension
				}
				break
			}
		}
	}
	pending := s.loadSubtitle(match, index, format, extension)
	select {
	case <-r.Context().Done():
		return r.Context().Err()
	case <-pending.done:
	}
	if pending.err != nil {
		return pending.err
	}
	content := pending.content
	kind := "text/vtt; charset=utf-8"
	if format == "ass" {
		kind = "text/x-ssa; charset=utf-8"
	}
	if format == "segment.vtt" {
		content = TimedVTT(content, offset)
	}
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Cache-Control", "private, max-age=300")
	if r.Method != "HEAD" {
		_, err = io.WriteString(w, content)
	}
	return err
}
