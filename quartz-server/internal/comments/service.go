package comments

import (
	"context"
	"goblincwl/quartz-server/internal/cache"
	"regexp"
	"sync"
)

// Service supports comment administration and private avatar-hash resolution.
type Service struct {
	ResolvePage func(context.Context, string) (PageTarget, error)
	pageMu      sync.Mutex
	Client      *Client
	Site        string
	Cache       cache.Cache
}

var emailHash = regexp.MustCompile(`(?i)^[a-f\d]{32}(?:[a-f\d]{32})?$`)

func integer(v any) (int64, bool) {
	n, ok := v.(float64)
	return int64(n), ok && n >= 0 && n <= 9007199254740991 && n == float64(int64(n))
}
