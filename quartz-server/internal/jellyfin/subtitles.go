package jellyfin

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Fetch Response.text() strips an initial UTF-8 BOM. Match that behavior when
// porting the existing adapter: Jellyfin's VTT responses can include this BOM.
func decodedText(raw []byte) string {
	return strings.TrimPrefix(strings.ToValidUTF8(string(raw), "\uFFFD"), "\uFEFF")
}

func IsPGS(codec string) bool {
	switch strings.ToLower(codec) {
	case "pgssub", "hdmv_pgs_subtitle", "pgs":
		return true
	}
	return false
}

type Delivery struct {
	Type, Extension string
	Burn            bool
}

func TextDelivery(codec string, isText bool) *Delivery {
	codec = strings.ToLower(codec)
	if codec == "ass" || codec == "ssa" {
		return &Delivery{Type: "ass", Extension: codec}
	}
	if isText || codec == "srt" || codec == "subrip" || codec == "webvtt" || codec == "vtt" {
		return &Delivery{Type: "vtt", Extension: "vtt"}
	}
	return nil
}
func SubtitleDelivery(stream map[string]any) Delivery {
	if IsPGS(text(stream["Codec"])) {
		return Delivery{Type: "pgs"}
	}
	if delivery := TextDelivery(text(stream["Codec"]), stream["IsTextSubtitleStream"] == true); delivery != nil {
		return *delivery
	}
	return Delivery{Type: "image", Burn: true}
}
func BurnedIndex(source map[string]any, index int, burnPGS, force bool) int {
	for _, raw := range list(source["MediaStreams"]) {
		s := object(raw)
		if s["Type"] == "Subtitle" && int(number(s["Index"])) == index && (force || burnPGS && IsPGS(text(s["Codec"]))) {
			return index
		}
	}
	return -1
}

var blankBlock = regexp.MustCompile(`\n\s*\n`)
var vttTime = regexp.MustCompile(`^\s*(?:\d+:)?\d{2}:\d{2}\.\d{3}\s+-->`)
var assAlignment = regexp.MustCompile(`\{[^}]*\\an([1-9])\b[^}]*\}`)
var vttSettings = regexp.MustCompile(`\s+(?:line|position|align):\S+`)
var bottomLine = regexp.MustCompile(`(\bline:)([0-9]+(?:\.[0-9]+)?)%(?:,(start|center|end))?(\s|$)`)
var assOverride = regexp.MustCompile(`\{\\[^}]*\}`)

func NormalizeTextSubtitle(content string) string {
	content = strings.ReplaceAll(strings.ReplaceAll(content, "\r\n", "\n"), "\r", "\n")
	blocks := blankBlock.Split(content, -1)
	for i, block := range blocks {
		lines := strings.Split(block, "\n")
		index := -1
		for j, line := range lines {
			if vttTime.MatchString(line) {
				index = j
				break
			}
		}
		if index < 0 {
			continue
		}
		// Jellyfin's custom text renderer anchors the caption block at its bottom.
		// Native WebVTT defaults to top alignment for percentage lines, which can
		// put a bilingual cue's second line below a small video's visible edge.
		lines[index] = bottomLine.ReplaceAllStringFunc(lines[index], func(setting string) string {
			parts := bottomLine.FindStringSubmatch(setting)
			percent, _ := strconv.ParseFloat(parts[2], 64)
			if parts[3] != "" || percent < 75 {
				return setting
			}
			return parts[1] + parts[2] + "%,end" + parts[4]
		})
		body := strings.Join(lines[index+1:], "\n")
		if match := assAlignment.FindStringSubmatch(body); len(match) > 1 {
			n, _ := strconv.Atoi(match[1])
			n--
			column, row := n%3, n/3
			lines[index] = vttSettings.ReplaceAllString(lines[index], "") + fmt.Sprintf(" line:%d%%,%s position:%d%% align:%s", []int{100, 50, 0}[row], []string{"end", "center", "start"}[row], []int{0, 50, 100}[column], []string{"start", "center", "end"}[column])
		}
		blocks[i] = strings.Join(append(lines[:index+1], assOverride.ReplaceAllString(body, "")), "\n")
	}
	return strings.Join(blocks, "\n\n")
}
func SubtitlePlaylist(duration float64, segmentURL string) string {
	if !finite(duration) || duration < 1 {
		duration = 1
	}
	return fmt.Sprintf("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:%.0f\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:%.3f,\n%s\n#EXT-X-ENDLIST\n", math.Ceil(duration), duration, segmentURL)
}

var vttHeader = regexp.MustCompile(`^WEBVTT[^\r\n]*\r?\n`)

func TimedVTT(content string, offset float64) string {
	timestamp := math.Round(offset * 90000)
	return vttHeader.ReplaceAllString(content, fmt.Sprintf("WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:%.0f\n", timestamp))
}

var nativeChinese = regexp.MustCompile(`(?i)中文|汉语|zh|chi|zho`)
var unsafeQuoted = regexp.MustCompile(`["\r\n]`)
var streamInf = regexp.MustCompile(`(?m)^#EXT-X-STREAM-INF:([^\r\n]*)`)
var streamSubtitleGroup = regexp.MustCompile(`,?SUBTITLES="[^"]*"`)
var hlsHeader = regexp.MustCompile(`(?m)^(#EXTM3U)\r?$`)

func WithSubtitleRenditions(manifest string, tracks []map[string]any, playlistURL func(map[string]any) string) string {
	if len(tracks) == 0 || !strings.Contains(manifest, "#EXT-X-STREAM-INF:") {
		return manifest
	}
	selected := -1
	for i, t := range tracks {
		if t["isDefault"] == true {
			selected = i
			break
		}
	}
	if selected < 0 {
		for i, t := range tracks {
			if nativeChinese.MatchString(text(t["language"]) + text(t["name"])) {
				selected = i
				break
			}
		}
	}
	if selected < 0 {
		selected = 0
	}
	lines := []string{}
	for i, t := range tracks {
		language := text(t["language"])
		if language == "" {
			language = "und"
		}
		defaultFlag := "NO"
		if i == selected {
			defaultFlag = "YES"
		}
		lines = append(lines, fmt.Sprintf(`#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="quartz-subs",NAME="%s",LANGUAGE="%s",DEFAULT=%s,AUTOSELECT=YES,FORCED=NO,URI="%s"`, unsafeQuoted.ReplaceAllString(text(t["name"]), ""), unsafeQuoted.ReplaceAllString(language, ""), defaultFlag, playlistURL(t)))
	}
	manifest = hlsHeader.ReplaceAllStringFunc(manifest, func(string) string { return "#EXTM3U\n" + strings.Join(lines, "\n") })
	return streamInf.ReplaceAllStringFunc(manifest, func(line string) string {
		return streamSubtitleGroup.ReplaceAllString(line, "") + `,SUBTITLES="quartz-subs"`
	})
}
