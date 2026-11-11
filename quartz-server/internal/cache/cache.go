package cache

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

type entry struct {
	value map[string]any
	at    time.Time
	bytes int
}
type work struct {
	done  chan struct{}
	value map[string]any
	err   error
}
type Cache struct {
	mu         sync.Mutex
	values     map[string]entry
	pending    map[string]*work
	size       int
	generation uint64
}

func clone(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	out := map[string]any{}
	for key, v := range value {
		out[key] = v
	}
	return out
}
func (c *Cache) Get(ctx context.Context, key string, ttl time.Duration, stale bool, load func(context.Context) (map[string]any, error)) (map[string]any, error) {
	c.mu.Lock()
	if c.values == nil {
		c.values = map[string]entry{}
	}
	if c.pending == nil {
		c.pending = map[string]*work{}
	}
	generation := c.generation
	old, exists := c.values[key]
	if exists && time.Since(old.at) < ttl {
		c.mu.Unlock()
		return clone(old.value), nil
	}
	if pending := c.pending[key]; pending != nil {
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-pending.done:
			return clone(pending.value), pending.err
		}
	}
	pending := &work{done: make(chan struct{})}
	c.pending[key] = pending
	c.mu.Unlock()
	value, err := safely(ctx, load)
	c.mu.Lock()
	if err == nil && generation == c.generation {
		raw, _ := json.Marshal(value)
		cost := len(raw)
		if cost <= 32<<20 {
			if current, ok := c.values[key]; ok {
				c.size -= current.bytes
				delete(c.values, key)
			}
			for len(c.values) >= 128 || c.size+cost > 32<<20 {
				var oldest string
				var at time.Time
				for key, item := range c.values {
					if at.IsZero() || item.at.Before(at) {
						oldest = key
						at = item.at
					}
				}
				c.size -= c.values[oldest].bytes
				delete(c.values, oldest)
			}
			c.values[key] = entry{value, time.Now(), cost}
			c.size += cost
		}
	} else if stale && exists && time.Since(old.at) < 24*time.Hour {
		value = clone(old.value)
		value["stale"] = true
		err = nil
	}
	pending.value = value
	pending.err = err
	if c.pending[key] == pending {
		delete(c.pending, key)
	}
	close(pending.done)
	c.mu.Unlock()
	return clone(value), err
}
func (c *Cache) Invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.values = map[string]entry{}
	c.pending = map[string]*work{}
	c.generation++
	c.size = 0
}

func safely(ctx context.Context, load func(context.Context) (map[string]any, error)) (value map[string]any, err error) {
	defer func() {
		if recover() != nil {
			value = nil
			err = errors.New("upstream loader failed")
		}
	}()
	return load(ctx)
}
