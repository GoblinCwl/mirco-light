package video

import (
	"context"
	"goblincwl/quartz-server/internal/cache"
	"time"
)

type Problem struct {
	Message string
	Status  int
}

func (e *Problem) Error() string { return e.Message }

type Service struct {
	Store      Store
	Client     *Client
	Controller *Controller
	Social     *Social
	Details    cache.Cache
	Changed    func()
}

func fresh(detail map[string]any) bool {
	if detail == nil || detail["stats"] == nil {
		return false
	}
	at, err := time.Parse(time.RFC3339Nano, text(detail["updatedAt"]))
	return err == nil && time.Since(at) <= 6*time.Hour
}
func (s *Service) Detail(ctx context.Context, bvid string) (map[string]any, error) {
	if !bvidPattern.MatchString(bvid) {
		return nil, &Problem{"视频不存在", 404}
	}
	videos, err := s.Store.All(ctx)
	if err != nil {
		return nil, err
	}
	meta, err := s.Store.Meta(ctx)
	if err != nil {
		return nil, err
	}
	known := false
	for _, video := range videos {
		if video.BVID == bvid {
			known = true
		}
	}
	var test map[string]any
	for _, raw := range list(parse(meta["test_videos"], []any{})) {
		v := object(raw)
		if v["bvid"] == bvid {
			test = v
			known = true
			break
		}
	}
	if !known {
		return nil, &Problem{"视频不存在", 404}
	}
	previous, err := s.Store.Detail(ctx, bvid)
	if err != nil {
		return nil, err
	}
	if test != nil && test["availability"] == "unavailable" {
		if previous != nil {
			return previous, nil
		}
		return map[string]any{"bvid": bvid, "availability": "unavailable", "unavailableReason": test["unavailableReason"], "pages": []any{}, "stats": map[string]any{}, "updatedAt": stamp()}, nil
	}
	if fresh(previous) {
		return previous, nil
	}
	result, err := s.Details.Get(ctx, bvid, 0, false, func(ctx context.Context) (map[string]any, error) {
		if latest, err := s.Store.Detail(ctx, bvid); err != nil {
			return nil, err
		} else if fresh(latest) {
			return latest, nil
		}
		cookie := ""
		if s.Client.Cookie != nil {
			var err error
			cookie, err = s.Client.Cookie(ctx)
			if err != nil {
				return nil, err
			}
		}
		owner := text(test["ownerMid"])
		if owner == "" {
			owner = s.Store.MID
		}
		detail, err := s.Client.Detail(ctx, bvid, owner, cookie)
		if err != nil {
			return nil, err
		}
		if err = s.Store.Put(ctx, "detail:"+bvid, detail); err != nil {
			return nil, err
		}
		if s.Changed != nil {
			s.Changed()
		}
		return detail, nil
	})
	if err != nil {
		if previous != nil {
			copy := map[string]any{"stale": true}
			for k, v := range previous {
				copy[k] = v
			}
			return copy, nil
		}
		return nil, &Problem{"视频分集信息暂不可用", 502}
	}
	return result, nil
}
