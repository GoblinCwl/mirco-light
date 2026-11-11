package jellyfin

import (
	"bytes"
	"encoding/json"
	"strings"
)

func jsonString(value any) string {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.Encode(value)
	return strings.TrimSuffix(buffer.String(), "\n")
}
func signature(stream map[string]any) []any {
	language := strings.ToLower(text(stream["Language"]))
	aliases := map[string]string{"zh": "zho", "chi": "zho", "en": "eng", "ja": "jpn", "ko": "kor", "fr": "fra", "fre": "fra", "de": "deu", "ger": "deu", "ru": "rus", "es": "spa"}
	if alias, ok := aliases[language]; ok {
		language = alias
	}
	return []any{language, strings.ToLower(text(stream["Codec"])), text(stream["Title"]), number(stream["Channels"]), stream["IsForced"] == true}
}
func TrackKey(stream map[string]any, streams []any) string {
	own := signature(stream)
	key := jsonString(own)
	occurrence := -1
	index := 0
	for _, raw := range streams {
		track := object(raw)
		if track["Type"] == stream["Type"] && jsonString(signature(track)) == key {
			if track["Index"] == stream["Index"] {
				occurrence = index
				break
			}
			index++
		}
	}
	return jsonString(append(own, occurrence))
}
func AudioOptions(source map[string]any) []map[string]any {
	tracks := []map[string]any{}
	streams := list(source["MediaStreams"])
	for _, raw := range streams {
		stream := object(raw)
		if stream["Type"] != "Audio" {
			continue
		}
		name := text(stream["DisplayTitle"])
		if name == "" {
			parts := []string{}
			for _, value := range []string{text(stream["Title"]), text(stream["Language"]), strings.ToUpper(text(stream["Codec"]))} {
				if value != "" {
					parts = append(parts, value)
				}
			}
			if channels := number(stream["Channels"]); channels != 0 {
				parts = append(parts, numeric(channels)+" 声道")
			}
			name = strings.Join(parts, " · ")
			if name == "" {
				name = "音轨 " + numeric(number(stream["Index"])+1)
			}
		}
		tracks = append(tracks, map[string]any{"index": stream["Index"], "key": TrackKey(stream, streams), "name": name})
	}
	return tracks
}
func DefaultAudio(source map[string]any) *int {
	tracks := AudioOptions(source)
	if index, exists := source["DefaultAudioStreamIndex"]; exists {
		for _, track := range tracks {
			if track["index"] == index {
				v := int(number(index))
				return &v
			}
		}
	}
	for _, raw := range list(source["MediaStreams"]) {
		stream := object(raw)
		if stream["Type"] == "Audio" && stream["IsDefault"] == true {
			v := int(number(stream["Index"]))
			return &v
		}
	}
	if len(tracks) > 0 {
		v := int(number(tracks[0]["index"]))
		return &v
	}
	return nil
}
func SubtitleOptions(matchID string, source map[string]any, publicBase string) []map[string]any {
	tracks := []map[string]any{}
	streams := list(source["MediaStreams"])
	for _, raw := range streams {
		stream := object(raw)
		if stream["Type"] != "Subtitle" || text(stream["Codec"]) == "" {
			continue
		}
		delivery := SubtitleDelivery(stream)
		base := publicBase + "subtitle/" + matchID + "/" + numeric(number(stream["Index"])) + "/"
		name := ""
		for _, field := range []string{"DisplayTitle", "Title", "Language"} {
			if name == "" {
				name = text(stream[field])
			}
		}
		if name == "" {
			name = "字幕 " + numeric(number(stream["Index"])+1)
		}
		uri := ""
		if !delivery.Burn {
			uri = base + delivery.Type
			if delivery.Type == "pgs" {
				uri = base + "sup"
			}
		}
		track := map[string]any{"index": stream["Index"], "key": TrackKey(stream, streams), "name": name, "language": text(stream["Language"]), "type": delivery.Type, "burn": delivery.Burn, "url": uri}
		if value, exists := stream["IsDefault"]; exists {
			track["isDefault"] = value
		}
		if delivery.Type != "pgs" && !delivery.Burn {
			track["nativeUrl"] = base + "vtt"
		}
		tracks = append(tracks, track)
	}
	return tracks
}
