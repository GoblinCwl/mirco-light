package jellyfin

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"goblincwl/quartz-server/internal/alerts"
	"goblincwl/quartz-server/internal/taskconfig"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Match struct {
	Access         Access
	Physical, Item string
	Source         map[string]any
	Height, Width  float64
	At             time.Time
	subtitlesMu    sync.Mutex
	subtitles      map[string]*subtitleLoad
}
type subtitleLoad struct {
	done    chan struct{}
	content string
	err     error
}
type Image struct {
	Item, Tag, Kind string
	Access          Access
	At              time.Time
}
type Session struct {
	Origin, PublicBase            string
	ID, Item, PlaySession, Device string
	Created, Touched              time.Time
	Active                        int
	TS, NativeSubtitles           bool
	MatchID                       string
	Subtitles                     []map[string]any
	Assets                        map[string]string
	Context                       context.Context
	Cancel                        context.CancelFunc
	Preroll                       *Preroll
}
type Service struct {
	Danmaku                        *Danmaku
	collectionCatalog              CollectionCatalog
	Catalog                        *Catalog
	Backend                        *Backend
	Origin                         string
	mu                             sync.Mutex
	matches                        map[string]*Match
	sessions                       map[string]*Session
	images                         map[string]Image
	lookupPending, playbackPending int
	jobs                           sync.WaitGroup
	ctx                            context.Context
	cancel                         context.CancelFunc
	done                           chan struct{}
}

func NewService(ctx context.Context, backend *Backend, origin string) *Service {
	root, cancel := context.WithCancel(ctx)
	s := &Service{Backend: backend, Origin: origin, matches: map[string]*Match{}, sessions: map[string]*Session{}, images: map[string]Image{}, ctx: root, cancel: cancel, done: make(chan struct{})}
	s.Danmaku = &Danmaku{Backend: backend}
	s.Catalog = &Catalog{Index: MediaIndex{DB: backend.Library}, ImageURL: s.ImageURL, GetItem: func(ctx context.Context, id string) (map[string]any, error) {
		user, err := backend.UserID(ctx)
		if err != nil {
			return nil, err
		}
		return backend.request(ctx, "GET", "/Users/"+url.PathEscape(user)+"/Items/"+url.PathEscape(id), nil)
	}, ItemURL: func(ctx context.Context, id string) (string, error) {
		values, err := backend.Settings(ctx)
		if err != nil {
			return "", err
		}
		base := text(values["api.jellyfin.publicUrl"])
		if base == "" {
			base = "https://media.goblincwl.site"
		}
		return strings.TrimRight(base, "/") + "/web/#/details?id=" + url.QueryEscape(id), nil
	}}
	go func() {
		defer close(s.done)
		ticker := taskconfig.NewTicker(root, "media-cleanup")
		defer ticker.Stop()
		for {
			select {
			case <-root.Done():
				return
			case <-ticker.C:
				s.cleanup()
			}
		}
	}()
	return s
}
func opaqueID() (string, error) {
	var raw [24]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(raw[:]), nil
}
func (s *Service) publicBase(ctx context.Context) (string, error) {
	values, err := s.Backend.Settings(ctx)
	if err != nil {
		return "", err
	}
	base := text(values["api.jellyfin.publicUrl"])
	if base == "" {
		base = "https://media.goblincwl.site"
	}
	return strings.TrimRight(base, "/") + "/api/public/quartz/jellyfin/", nil
}
func (s *Service) match(ctx context.Context, id string) (*Match, error) {
	s.mu.Lock()
	match := s.matches[id]
	s.mu.Unlock()
	if match == nil || time.Since(match.At) > 12*time.Hour {
		return nil, errors.New("播放授权已失效")
	}
	physical, err := s.Backend.Authorize(ctx, match.Access, false)
	if err != nil {
		return nil, err
	}
	if physical != match.Physical {
		return nil, errors.New("播放授权已失效")
	}
	return match, nil
}
func (s *Service) itemTimeline(ctx context.Context, item string) ([]any, []any) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var segments, chapters []any
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		if value, err := s.Backend.request(ctx, "GET", "/MediaSegments/"+item, nil); err == nil {
			segments = list(value["Items"])
		}
	}()
	go func() {
		defer wg.Done()
		user, err := s.Backend.UserID(ctx)
		if err != nil {
			return
		}
		if value, err := s.Backend.request(ctx, "GET", "/Users/"+url.PathEscape(user)+"/Items/"+item, nil); err == nil {
			chapters = list(value["Chapters"])
		}
	}()
	wg.Wait()
	return segments, chapters
}
func (s *Service) Lookup(ctx context.Context, body map[string]any, token string) (map[string]any, error) {
	s.mu.Lock()
	if s.ctx.Err() != nil || len(s.matches)+s.lookupPending >= 500 {
		s.mu.Unlock()
		return nil, errors.New("播放请求过多")
	}
	s.lookupPending++
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.lookupPending--; s.mu.Unlock() }()
	virtual, err := NormalPath(text(body["path"]))
	if err != nil {
		return nil, err
	}
	access := Access{Path: virtual, Password: text(body["password"]), Token: token}
	physical, err := s.Backend.Authorize(ctx, access, false)
	if err != nil {
		return nil, err
	}
	if physical == "" {
		return map[string]any{"matched": false}, nil
	}
	item, err := s.Backend.FindItem(ctx, physical)
	if err != nil {
		return nil, err
	}
	if item == "" {
		return map[string]any{"matched": false}, nil
	}
	var segments, chapters []any
	var timeline sync.WaitGroup
	timeline.Add(1)
	go func() { defer timeline.Done(); segments, chapters = s.itemTimeline(ctx, item) }()
	user, err := s.Backend.UserID(ctx)
	if err != nil {
		timeline.Wait()
		return nil, err
	}
	info, err := s.Backend.request(ctx, "GET", "/Items/"+item+"/PlaybackInfo?UserId="+url.QueryEscape(user), nil)
	timeline.Wait()
	if err != nil {
		return nil, err
	}
	sources := list(info["MediaSources"])
	if len(sources) == 0 {
		return map[string]any{"matched": false}, nil
	}
	source := object(sources[0])
	var video map[string]any
	for _, raw := range list(source["MediaStreams"]) {
		v := object(raw)
		if v["Type"] == "Video" {
			video = v
			break
		}
	}
	height, width := number(video["Height"]), number(video["Width"])
	if height == 0 {
		height = 1080
	}
	id, err := opaqueID()
	if err != nil {
		return nil, err
	}
	match := &Match{Access: access, Physical: physical, Item: item, Source: source, Height: height, Width: width, At: time.Now()}
	var kind string
	var series, season sql.NullString
	err = s.Backend.Library.QueryRowContext(ctx, "SELECT Type,SeriesId,SeasonId FROM BaseItems WHERE Path=? LIMIT 1", physical).Scan(&kind, &series, &season)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	scopes := map[string]any{"program": "jellyfin:movie:" + item}
	if series.Valid && series.String != "" {
		scopes["program"] = "jellyfin:series:" + NormalizeID(series.String)
	}
	if season.Valid && season.String != "" {
		scopes["season"] = "jellyfin:season:" + NormalizeID(season.String)
	}
	base, err := s.publicBase(ctx)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	if s.ctx.Err() != nil {
		s.mu.Unlock()
		return nil, errors.New("媒体服务正在退出")
	}
	s.matches[id] = match
	s.mu.Unlock()
	result := map[string]any{"matched": true, "match": id, "scopes": scopes, "timeline": Timeline(segments, chapters, number(source["RunTimeTicks"])), "subtitles": SubtitleOptions(id, source, base), "qualities": Qualities(height, width), "audioTracks": AudioOptions(source)}
	// Jellyfin resolves language, subtitle mode, forced/default and remembered
	// selections for this user. A null default means subtitles are off.
	result["defaultSubtitleStreamIndex"] = -1
	if index, ok := source["DefaultSubtitleStreamIndex"].(float64); ok && index >= 0 {
		result["defaultSubtitleStreamIndex"] = int(index)
	}
	if video["Codec"] != nil {
		result["videoCodec"] = video["Codec"]
	}
	if h, w := number(video["Height"]), number(video["Width"]); h > 0 && w > 0 {
		result["videoAspectRatio"] = w / h
	}
	if index := DefaultAudio(source); index != nil {
		result["audioStreamIndex"] = *index
	}
	return result, nil
}
func (s *Service) asset(ctx context.Context, session *Session, input string) (string, error) {
	target, err := SafeMediaAsset(input, session.Origin, session.Item)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(target.String()))
	key := hex.EncodeToString(sum[:])[:24]
	s.mu.Lock()
	session.Assets[key] = target.String()
	s.mu.Unlock()
	return session.PublicBase + "stream/" + session.ID + "/" + key, nil
}

// Only response-header latency is bounded for media requests. An open direct
// file body must remain usable for the entire film and respect caller cancel.
var mediaClient = &http.Client{Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, MaxIdleConns: 100, MaxIdleConnsPerHost: 20, IdleConnTimeout: 90 * time.Second, ResponseHeaderTimeout: 60 * time.Second}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
var subtitleClient = &http.Client{Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, MaxIdleConns: 20, MaxIdleConnsPerHost: 8, IdleConnTimeout: 90 * time.Second, ResponseHeaderTimeout: 120 * time.Second}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func (s *Service) fetch(ctx context.Context, target, method string, headers http.Header) (*http.Response, error) {
	return s.fetchUsing(ctx, target, method, headers, mediaClient)
}
func (s *Service) fetchUsing(ctx context.Context, target, method string, headers http.Header, fallback *http.Client) (*http.Response, error) {
	base, token, values, err := s.Backend.configuration(ctx)
	if err != nil {
		return nil, err
	}
	resource, err := url.Parse(target)
	if err != nil || resource.User != nil {
		return nil, errors.New("无效的媒体资源")
	}
	jellyfinURL, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	fontURL := text(values["api.fontinass.url"])
	if fontURL == "" {
		fontURL = "http://fontinass:8012"
	}
	font, err := url.Parse(fontURL)
	if err != nil {
		return nil, err
	}
	if origin(resource) != origin(jellyfinURL) && origin(resource) != origin(font) {
		return nil, errors.New("媒体服务地址已变更，请重新打开播放器")
	}
	// Cancel a stalled connection/header exchange, then lift that deadline for
	// a direct-file body. Closing the body still releases its request context.
	ctx, cancel := context.WithCancel(ctx)
	deadline := 60 * time.Second
	if fallback == subtitleClient {
		deadline = 120 * time.Second
	}
	timer := time.AfterFunc(deadline, cancel)
	request, err := http.NewRequestWithContext(ctx, method, target, nil)
	if err != nil {
		timer.Stop()
		cancel()
		return nil, err
	}
	request.Header = headers.Clone()
	if request.Header == nil {
		request.Header = make(http.Header)
	}
	request.Header.Set("X-Emby-Token", token)
	client := s.Backend.HTTP
	if client == nil {
		client = fallback
	}
	response, err := alerts.Do(client, "Jellyfin", request)
	timer.Stop()
	if err != nil {
		cancel()
		return nil, errors.New("媒体响应超时或连接中断")
	}
	response.Body = &cancelBody{ReadCloser: response.Body, cancel: cancel}
	return response, nil
}

type cancelBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *cancelBody) Close() error { err := b.ReadCloser.Close(); b.cancel(); return err }
func (s *Service) readMedia(ctx context.Context, session *Session, target *url.URL) (io.ReadCloser, error) {
	base, _, _, err := s.Backend.configuration(ctx)
	if err != nil {
		return nil, err
	}
	safe, err := SafeMediaAsset(target.String(), base, session.Item)
	if err != nil {
		return nil, err
	}
	response, err := s.fetch(ctx, safe.String(), "GET", nil)
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		response.Body.Close()
		return nil, errors.New("Jellyfin 播放片段准备失败")
	}
	return response.Body, nil
}
func (s *Service) Playback(ctx context.Context, body map[string]any) (map[string]any, error) {
	matchID := text(body["match"])
	match, err := s.match(ctx, matchID)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	if s.ctx.Err() != nil || len(s.sessions)+s.playbackPending >= 100 {
		s.mu.Unlock()
		return nil, errors.New("同时播放的会话过多")
	}
	s.playbackPending++
	s.mu.Unlock()
	defer func() { s.mu.Lock(); s.playbackPending--; s.mu.Unlock() }()
	qualities := Qualities(match.Height, match.Width)
	quality := qualities[0]
	for _, q := range qualities {
		if q.ID == text(body["quality"]) {
			quality = q
			break
		}
	}
	audioIndex := DefaultAudio(match.Source)
	for _, track := range AudioOptions(match.Source) {
		if track["index"] == body["audioStreamIndex"] {
			n := int(number(track["index"]))
			audioIndex = &n
			break
		}
	}
	requestedSubtitle := -1
	if v, exists := body["subtitleStreamIndex"]; exists {
		requestedSubtitle = int(number(v))
	}
	subtitleIndex := BurnedIndex(match.Source, requestedSubtitle, body["burnPgs"] != false, body["forceBurn"] == true)
	subtitleCodec := ""
	for _, raw := range list(match.Source["MediaStreams"]) {
		track := object(raw)
		if track["Type"] == "Subtitle" && int(number(track["Index"])) == subtitleIndex {
			subtitleCodec = strings.ToLower(text(track["Codec"]))
		}
	}
	var nativeAudio *int
	for _, raw := range list(match.Source["MediaStreams"]) {
		track := object(raw)
		if track["Type"] != "Audio" {
			continue
		}
		if nativeAudio == nil || track["IsDefault"] == true {
			n := int(number(track["Index"]))
			nativeAudio = &n
			if track["IsDefault"] == true {
				break
			}
		}
	}
	audioRequired := (audioIndex == nil) != (nativeAudio == nil)
	if audioIndex != nil && nativeAudio != nil {
		audioRequired = *audioIndex != *nativeAudio
	}
	user, err := s.Backend.UserID(ctx)
	if err != nil {
		return nil, err
	}
	var maxBitrate *float64
	if v, exists := body["maxBitrate"]; exists {
		n := number(v)
		maxBitrate = &n
	}
	position := math.Min(math.Max(0, number(body["position"])), math.Max(0, number(match.Source["RunTimeTicks"])/10000000-1))
	negotiation, err := PlaybackRequest(PlaybackOptions{DeviceProfile: object(body["deviceProfile"]), Quality: quality, MaxBitrate: maxBitrate, ForceTranscode: body["forceTranscode"] == true, AudioSelectionRequired: audioRequired, UserID: user, MediaSourceID: text(match.Source["Id"]), AudioStreamIndex: audioIndex, SubtitleStreamIndex: subtitleIndex, SubtitleCodec: subtitleCodec, Position: position, SourceBitrate: number(match.Source["Bitrate"])})
	if err != nil {
		return nil, err
	}
	deviceID, err := opaqueID()
	if err != nil {
		return nil, err
	}
	device := "quartz-" + deviceID
	info, err := s.Backend.request(ctx, "POST", "/Items/"+match.Item+"/PlaybackInfo", negotiation)
	if err != nil {
		return nil, err
	}
	origin, _, _, err := s.Backend.configuration(ctx)
	if err != nil {
		return nil, err
	}
	selected, err := SelectSource(info, text(match.Source["Id"]), match.Item, origin)
	if err != nil {
		return nil, err
	}
	q := selected.URL.Query()
	q.Set("DeviceId", device)
	selected.URL.RawQuery = q.Encode()
	sessionID, err := opaqueID()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	sessionCtx, cancel := context.WithCancel(s.ctx)
	session := &Session{ID: sessionID, Item: match.Item, PlaySession: text(info["PlaySessionId"]), Device: device, Created: now, Touched: now, Assets: map[string]string{}, TS: selected.Type == "m3u8" && selected.Source["TranscodingContainer"] == "ts", NativeSubtitles: body["nativeSubtitles"] == true, MatchID: matchID, Context: sessionCtx, Cancel: cancel, Subtitles: []map[string]any{}}
	success := false
	defer func() {
		if !success {
			s.stop(session)
		}
	}()
	publicBase, err := s.publicBase(ctx)
	if err != nil {
		return nil, err
	}
	session.Origin, session.PublicBase = origin, publicBase
	if subtitleIndex < 0 {
		for _, track := range SubtitleOptions(matchID, match.Source, publicBase) {
			if track["type"] != "pgs" && track["burn"] != true {
				session.Subtitles = append(session.Subtitles, track)
			}
		}
	}
	session.Preroll = &Preroll{Warm: func(ctx context.Context, target string) error {
		ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
		u, err := url.Parse(target)
		if err != nil {
			return err
		}
		body, err := s.readMedia(ctx, session, u)
		if err != nil {
			return err
		}
		defer body.Close()
		_, err = io.Copy(io.Discard, body)
		return err
	}}
	if selected.Type == "m3u8" {
		startup, cancel := context.WithTimeout(ctx, 60*time.Second)
		err = PrepareHLS(startup, selected.URL, number(negotiation["StartTimeTicks"])/10000000, func(ctx context.Context, u *url.URL) (io.ReadCloser, error) { return s.readMedia(ctx, session, u) }, session.Preroll)
		cancel()
		if err != nil {
			return nil, err
		}
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	playbackURL, err := s.asset(ctx, session, selected.URL.String())
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	if s.ctx.Err() != nil {
		s.mu.Unlock()
		return nil, errors.New("媒体服务正在退出")
	}
	s.sessions[sessionID] = session
	s.mu.Unlock()
	success = true
	out := Diagnostics(selected)
	out["session"] = session.ID
	out["url"] = playbackURL
	out["type"] = selected.Type
	out["playMethod"] = selected.Method
	out["maxStreamingBitrate"] = negotiation["MaxStreamingBitrate"]
	out["subtitleStreamIndex"] = subtitleIndex
	if audioIndex != nil {
		out["audioStreamIndex"] = *audioIndex
	}
	return out, nil
}
func (s *Service) stop(session *Session) {
	if session == nil {
		return
	}
	s.mu.Lock()
	delete(s.sessions, session.ID)
	s.mu.Unlock()
	session.Cancel()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = s.Backend.request(ctx, "DELETE", "/Videos/ActiveEncodings?"+url.Values{"DeviceId": {session.Device}, "PlaySessionId": {session.PlaySession}}.Encode(), nil)
}
func (s *Service) Stop(id string) {
	s.mu.Lock()
	session := s.sessions[id]
	s.mu.Unlock()
	s.stop(session)
}
func (s *Service) cleanup() {
	now := time.Now()
	expired := []*Session{}
	s.mu.Lock()
	for id, match := range s.matches {
		if now.Sub(match.At) > 12*time.Hour {
			delete(s.matches, id)
		}
	}
	for id, image := range s.images {
		if now.Sub(image.At) > 12*time.Hour {
			delete(s.images, id)
		}
	}
	for _, session := range s.sessions {
		if SessionExpired(session.Created, session.Touched, session.Active, now) {
			expired = append(expired, session)
		}
	}
	s.mu.Unlock()
	for _, session := range expired {
		s.stop(session)
	}
}
func (s *Service) Close() {
	s.mu.Lock()
	s.cancel()
	s.mu.Unlock()
	<-s.done
	s.jobs.Wait()
	s.mu.Lock()
	sessions := []*Session{}
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	s.mu.Unlock()
	var wg sync.WaitGroup
	for _, session := range sessions {
		wg.Add(1)
		go func(session *Session) { defer wg.Done(); s.stop(session) }(session)
	}
	wg.Wait()
}
