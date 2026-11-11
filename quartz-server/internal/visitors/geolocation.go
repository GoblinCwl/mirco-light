package visitors

import (
	"context"
	"database/sql"
	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
	"net/netip"
	"strings"
	"sync"
)

type Geo struct {
	mu     sync.Mutex
	v4, v6 *xdb.Searcher
}

func NewGeo(ctx context.Context, db *sql.DB) (*Geo, error) {
	g := &Geo{}
	for _, version := range []*xdb.Version{xdb.IPv4, xdb.IPv6} {
		raw, err := loadGeoBuffer(ctx, db, version.Id)
		if err != nil {
			g.Close()
			return nil, err
		}
		searcher, err := xdb.NewWithBuffer(version, raw)
		if err != nil {
			g.Close()
			return nil, err
		}
		if version == xdb.IPv4 {
			g.v4 = searcher
		} else {
			g.v6 = searcher
		}
	}
	return g, nil
}
func usable(value string) bool {
	return value != "" && value != "0" && !strings.Contains(value, "内网") && !strings.Contains(value, "保留") && !strings.Contains(value, "未知") && !strings.Contains(strings.ToLower(value), "reserved")
}
func Region(raw string) *string {
	fields := strings.Split(raw, "|")
	if len(fields) == 0 || !usable(fields[0]) {
		return nil
	}
	region := fields[0]
	if region == "中国" && len(fields) > 1 && usable(fields[1]) {
		region = fields[1]
	}
	return &region
}
func City(raw string) *string {
	if Region(raw) == nil {
		return nil
	}
	fields := strings.Split(raw, "|")
	if len(fields) < 3 || !usable(fields[2]) {
		return nil
	}
	return &fields[2]
}
func (g *Geo) Lookup(ip string) Location {
	parsed, err := netip.ParseAddr(ip)
	if err != nil {
		return Location{Status: "unsupported_address"}
	}
	// Official searchers mutate their IO counter even with an in-memory buffer.
	g.mu.Lock()
	defer g.mu.Unlock()
	searcher := g.v6
	if parsed.Unmap().Is4() {
		searcher = g.v4
	}
	if searcher == nil {
		return Location{Status: "database_unavailable"}
	}
	raw, err := searcher.Search(parsed.Unmap().String())
	if err != nil {
		message := stringClip(err.Error(), 500)
		return Location{Status: "lookup_error", Error: &message}
	}
	region := Region(raw)
	status := "resolved"
	if region == nil {
		status = "unusable_region"
		if raw == "" {
			status = "not_found"
		}
	}
	return Location{Region: region, Status: status, Raw: &raw}
}
func (g *Geo) Close() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.v4 != nil {
		g.v4.Close()
		g.v4 = nil
	}
	if g.v6 != nil {
		g.v6.Close()
		g.v6 = nil
	}
}
