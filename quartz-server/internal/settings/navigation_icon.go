package settings

import (
	"goblincwl/quartz-server/internal/svgicon"
	"regexp"
)

var iconName = regexp.MustCompile(`^[a-z][a-z0-9-]{0,39}$`)

func validNavigationIcon(source string) bool {
	return iconName.MatchString(source) || svgicon.Valid(source)
}
