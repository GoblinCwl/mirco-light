package jellyfin

import (
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Quality struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Bitrate float64 `json:"bitrate"`
}

func Qualities(height, width float64) []Quality {
	resolution := math.Max(height, width*9/16)
	dimensions := ""
	if width > 0 && height > 0 {
		dimensions = " · " + numeric(width) + "×" + numeric(height)
	}
	out := []Quality{{"auto", "自动", 0}, {"original", "原画" + dimensions, 2147483647}}
	for _, pair := range [][2]float64{{2160, 30000000}, {1080, 8000000}, {720, 4000000}, {480, 1500000}} {
		if pair[0] <= resolution {
			out = append(out, Quality{numeric(pair[0]), numeric(pair[0]) + "p · " + numeric(pair[1]/1000000) + " Mbps", pair[1]})
		}
	}
	return out
}
func numeric(value float64) string    { return strconv.FormatFloat(value, 'f', -1, 64) }
func text(value any) string           { v, _ := value.(string); return v }
func object(value any) map[string]any { v, _ := value.(map[string]any); return v }
func list(value any) []any            { v, _ := value.([]any); return v }
func number(value any) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		n, _ := v.Float64()
		return n
	case string:
		n, _ := strconv.ParseFloat(v, 64)
		return n
	}
	return 0
}
func finite(n float64) bool { return !math.IsNaN(n) && !math.IsInf(n, 0) }

type ProfileOptions struct {
	Bitrate, Height      float64
	BurnSubtitleCodec    string
	Original, Compatible bool
}

func PlaybackProfile(value map[string]any, options ProfileOptions) (map[string]any, error) {
	raw, err := json.Marshal(value)
	if err != nil || value == nil || len(raw) > 48000 {
		return nil, errors.New("播放器能力信息无效，请刷新页面")
	}
	if _, ok := value["DirectPlayProfiles"].([]any); !ok {
		return nil, errors.New("播放器能力信息无效，请刷新页面")
	}
	if _, ok := value["TranscodingProfiles"].([]any); !ok {
		return nil, errors.New("播放器能力信息无效，请刷新页面")
	}
	var profile map[string]any
	if err = json.Unmarshal(raw, &profile); err != nil {
		return nil, err
	}
	if options.Compatible {
		others, video := []any{}, []any{}
		for _, raw := range list(profile["TranscodingProfiles"]) {
			p := object(raw)
			if p["Type"] != "Video" {
				others = append(others, raw)
			} else if p["Protocol"] == "hls" && p["Container"] == "ts" {
				video = append(video, raw)
			}
		}
		if len(video) == 0 {
			return nil, errors.New("浏览器未提供兼容的 HLS 播放能力")
		}
		profile["TranscodingProfiles"] = append(others, video...)
	}
	profile["Name"] = "微光集网页播放器"
	for _, key := range []string{"MaxStreamingBitrate", "MaxStaticBitrate"} {
		bitrate := options.Bitrate
		if existing := number(profile[key]); !options.Original && existing != 0 {
			bitrate = math.Min(existing, bitrate)
		}
		profile[key] = bitrate
	}
	if profile["CodecProfiles"] == nil {
		profile["CodecProfiles"] = []any{}
	}
	if options.Height > 0 {
		conditions := []any{map[string]any{"Condition": "LessThanEqual", "Property": "Height", "Value": numeric(options.Height), "IsRequired": true}, map[string]any{"Condition": "LessThanEqual", "Property": "Width", "Value": numeric(math.Ceil(options.Height*16/9/2) * 2), "IsRequired": true}}
		profiles, ok := profile["CodecProfiles"].([]any)
		if !ok {
			return nil, errors.New("播放器编码能力信息无效")
		}
		profile["CodecProfiles"] = append(profiles, map[string]any{"Type": "Video", "Conditions": conditions})
	}
	if options.BurnSubtitleCodec != "" {
		profile["SubtitleProfiles"] = []any{map[string]any{"Format": options.BurnSubtitleCodec, "Method": "Encode"}}
	}
	return profile, nil
}

type PlaybackOptions struct {
	DeviceProfile          map[string]any `json:"deviceProfile"`
	Quality                Quality        `json:"quality"`
	MaxBitrate             *float64       `json:"maxBitrate"`
	ForceTranscode         bool           `json:"forceTranscode"`
	AudioSelectionRequired bool           `json:"audioSelectionRequired"`
	UserID                 string         `json:"userId"`
	MediaSourceID          string         `json:"mediaSourceId"`
	AudioStreamIndex       *int           `json:"audioStreamIndex"`
	SubtitleStreamIndex    int            `json:"subtitleStreamIndex"`
	SubtitleCodec          string         `json:"subtitleCodec"`
	Position               float64        `json:"position"`
	SourceBitrate          float64        `json:"sourceBitrate"`
}

func PlaybackRequest(options PlaybackOptions) (map[string]any, error) {
	automatic, original := options.Quality.ID == "auto", options.Quality.ID == "original"
	bitrate := options.Quality.Bitrate
	if original {
		bitrate = 120000000
		if finite(options.SourceBitrate) && options.SourceBitrate > 0 {
			bitrate = math.Min(2147483647, math.Ceil(options.SourceBitrate))
		}
	} else if automatic {
		bitrate = 1500000
		if options.MaxBitrate != nil && finite(*options.MaxBitrate) {
			bitrate = *options.MaxBitrate
		}
		bitrate = math.Min(120000000, math.Max(64000, bitrate))
	}
	height := float64(0)
	if !automatic && !original {
		height, _ = strconv.ParseFloat(options.Quality.ID, 64)
	}
	codec := ""
	if options.SubtitleStreamIndex >= 0 {
		codec = options.SubtitleCodec
		if codec == "" {
			codec = "pgssub"
		}
	}
	profile, err := PlaybackProfile(options.DeviceProfile, ProfileOptions{Bitrate: bitrate, Height: height, BurnSubtitleCodec: codec, Original: original, Compatible: options.ForceTranscode || options.SubtitleStreamIndex >= 0})
	if err != nil {
		return nil, err
	}
	position := options.Position
	if !finite(position) || position < 0 {
		position = 0
	}
	direct := !options.ForceTranscode && !options.AudioSelectionRequired && options.SubtitleStreamIndex < 0
	result := map[string]any{"IsPlayback": true, "AutoOpenLiveStream": true, "UserId": options.UserID, "MediaSourceId": options.MediaSourceID, "StartTimeTicks": math.Round(position * 10000000), "MaxStreamingBitrate": bitrate, "EnableDirectPlay": direct, "EnableDirectStream": direct, "EnableTranscoding": true, "AllowVideoStreamCopy": !options.ForceTranscode, "SubtitleStreamIndex": options.SubtitleStreamIndex, "DeviceProfile": profile}
	if options.AudioStreamIndex != nil {
		result["AudioStreamIndex"] = *options.AudioStreamIndex
	}
	return result, nil
}
func origin(value *url.URL) string {
	host := strings.ToLower(value.Host)
	if value.Scheme == "http" && value.Port() == "80" || value.Scheme == "https" && value.Port() == "443" {
		host = strings.ToLower(value.Hostname())
	}
	return strings.ToLower(value.Scheme) + "://" + host
}
func SafeMediaAsset(input, base, item string) (*url.URL, error) {
	if strings.Contains(input, "\\") || strings.IndexFunc(input, func(r rune) bool { return r < 32 }) >= 0 {
		return nil, errors.New("无效的媒体资源")
	}
	root, err := url.Parse(base)
	if err != nil || root.Host == "" {
		return nil, errors.New("无效的媒体服务地址")
	}
	relative, err := url.Parse(input)
	if err != nil {
		return nil, errors.New("无效的媒体资源")
	}
	target := root.ResolveReference(relative)
	parts := strings.Split(strings.ToLower(target.EscapedPath()), "/")
	normalize := func(v string) string { return strings.ReplaceAll(strings.ToLower(v), "-", "") }
	if origin(target) != origin(root) || len(parts) < 3 || parts[1] != "videos" || normalize(parts[2]) != normalize(item) || target.User != nil {
		return nil, errors.New("无效的媒体资源")
	}
	query := target.Query()
	for key := range query {
		if strings.EqualFold(key, "api_key") || strings.EqualFold(key, "apikey") {
			query.Del(key)
		}
	}
	target.RawQuery = query.Encode()
	return target, nil
}

var containerName = regexp.MustCompile(`^[a-z0-9]{1,12}$`)

type Selected struct {
	Source       map[string]any
	URL          *url.URL
	Method, Type string
}

func SelectSource(info map[string]any, mediaSourceID, item, base string) (Selected, error) {
	out := Selected{}
	if code := info["ErrorCode"]; code != nil && code != "" && code != false && code != float64(0) {
		return out, errors.New("Jellyfin 无法播放此媒体（" + text(code) + "）")
	}
	sources := list(info["MediaSources"])
	var source map[string]any
	for _, raw := range sources {
		candidate := object(raw)
		if candidate["Id"] == mediaSourceID {
			source = candidate
			break
		}
	}
	if source == nil && len(sources) > 0 {
		source = object(sources[0])
	}
	if source == nil {
		return out, errors.New("Jellyfin 未提供可用媒体源")
	}
	out.Source = source
	if source["SupportsDirectPlay"] == true || source["SupportsDirectStream"] == true {
		container := strings.ToLower(text(source["Container"]))
		if !containerName.MatchString(container) {
			return out, errors.New("Jellyfin 返回的媒体封装无效")
		}
		root, err := url.Parse(base)
		if err != nil {
			return out, err
		}
		out.URL = root.ResolveReference(&url.URL{Path: "/Videos/" + item + "/stream." + container})
		query := out.URL.Query()
		query.Set("Static", "true")
		query.Set("MediaSourceId", text(source["Id"]))
		if tag := text(source["ETag"]); tag != "" {
			query.Set("Tag", tag)
		}
		out.URL.RawQuery = query.Encode()
		out.Type = container
		out.Method = "DirectStream"
		if source["SupportsDirectPlay"] == true {
			out.Method = "DirectPlay"
		}
		return out, nil
	}
	if source["SupportsTranscoding"] != true || text(source["TranscodingUrl"]) == "" {
		return out, errors.New("Jellyfin 未提供兼容的播放方案")
	}
	target, err := SafeMediaAsset(text(source["TranscodingUrl"]), base, item)
	if err != nil {
		return out, err
	}
	out.URL = target
	out.Method = "Transcode"
	out.Type = text(source["TranscodingContainer"])
	if out.Type == "" {
		out.Type = "mp4"
	}
	if source["TranscodingSubProtocol"] == "hls" {
		out.Type = "m3u8"
	}
	return out, nil
}
func Diagnostics(selected Selected) map[string]any {
	query := selected.URL.Query()
	reasons := []string{}
	for _, reason := range strings.Split(query.Get("TranscodeReasons"), ",") {
		if reason != "" {
			reasons = append(reasons, reason)
		}
	}
	parameters := map[string]string{}
	for _, key := range []string{"VideoCodec", "AudioCodec", "AllowVideoStreamCopy", "AllowAudioStreamCopy", "MaxWidth", "MaxHeight", "VideoBitrate", "SubtitleMethod", "SubtitleStreamIndex"} {
		if query.Has(key) {
			parameters[key] = query.Get(key)
		}
	}
	result := map[string]any{"transcodeReasons": reasons, "streamParameters": parameters}
	for _, raw := range list(selected.Source["MediaStreams"]) {
		stream := object(raw)
		if stream["Type"] == "Video" {
			video := map[string]any{}
			for source, key := range map[string]string{"Codec": "codec", "Width": "width", "Height": "height"} {
				if v, ok := stream[source]; ok {
					video[key] = v
				}
			}
			result["sourceVideo"] = video
			break
		}
	}
	return result
}
func SessionExpired(created, touched time.Time, active int, now time.Time) bool {
	return created.IsZero() || now.Sub(created) >= 12*time.Hour || (active <= 0 && now.Sub(touched) >= 20*time.Minute)
}
