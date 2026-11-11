package emoji

import (
	"github.com/rivo/uniseg"
	"regexp"
	"sort"
	"unicode/utf16"
)

var keycap = regexp.MustCompile(`[0-9#*]\x{FE0F}?\x{20E3}`)

func ExtendedPictographic(r rune) bool {
	index := sort.Search(len(extendedPictographic), func(i int) bool { return extendedPictographic[i][1] >= r })
	return index < len(extendedPictographic) && r >= extendedPictographic[index][0]
}
func Single(value string) bool {
	if value == "" || len(utf16.Encode([]rune(value))) > 64 || uniseg.GraphemeClusterCount(value) != 1 {
		return false
	}
	if keycap.MatchString(value) {
		return true
	}
	for _, r := range value {
		if ExtendedPictographic(r) || r >= 0x1F1E6 && r <= 0x1F1FF {
			return true
		}
	}
	return false
}
