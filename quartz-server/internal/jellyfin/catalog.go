package jellyfin

import (
	"context"
	"database/sql"
	"goblincwl/quartz-server/internal/cache"
	"math"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"
)

var mediaVideo = regexp.MustCompile(`(?i)\.(mkv|mp4|m4v|avi|mov|webm|wmv|flv|ts|m2ts|mpg|mpeg|rmvb|vob|ogv)$`)
var sidecar = regexp.MustCompile(`(?i)\.(xml|ass|ssa|srt|vtt|sub|idx|nfo|lrc|bif)$`)
var sidecarImage = regexp.MustCompile(`(?i)^(?:poster|folder|cover|fanart|backdrop|banner|landscape|logo|clearlogo|disc|season\d+[-_.]poster|.*[-_.](?:poster|fanart|thumb))\.(?:jpe?g|png|webp|avif)$`)

func IsMediaVideo(name string) bool { return mediaVideo.MatchString(name) }
func IsSidecar(name string) bool    { return sidecar.MatchString(name) || sidecarImage.MatchString(name) }

var seasonName = regexp.MustCompile(`(?i)^season\s*\d+$`)

func MediaTitle(item map[string]any) string {
	if item["Type"] == "Season" && (text(item["Name"]) == "" || seasonName.MatchString(text(item["Name"]))) {
		if number(item["IndexNumber"]) == 0 && item["IndexNumber"] != nil {
			return "特别篇"
		}
		index := float64(1)
		if item["IndexNumber"] != nil {
			index = number(item["IndexNumber"])
		}
		return "第 " + numeric(index) + " 季"
	}
	return text(item["Name"])
}

type MediaIndex struct {
	DB     *sql.DB
	mu     sync.Mutex
	at     time.Time
	exact  map[string]map[string]any
	movies map[string][]map[string]any
}

func (i *MediaIndex) Find(ctx context.Context, physical string, directory, video bool) (map[string]any, error) {
	i.mu.Lock()
	defer i.mu.Unlock()
	if i.exact == nil || time.Since(i.at) > time.Minute {
		rows, err := i.DB.QueryContext(ctx, "SELECT Id,Path,Type,Name,SeriesName,IndexNumber,ParentIndexNumber,SeriesId,SeasonId FROM BaseItems WHERE Path IS NOT NULL AND (Type LIKE '%.Movie' OR Type LIKE '%.Series' OR Type LIKE '%.Season' OR Type LIKE '%.Episode')")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		exact := map[string]map[string]any{}
		movies := map[string][]map[string]any{}
		counts := map[string]int{}
		seasonCounts := map[string]map[string]bool{}
		for rows.Next() {
			var id, physical, kind string
			var name, seriesName, seriesID, seasonID sql.NullString
			var index, parent sql.NullInt64
			if err = rows.Scan(&id, &physical, &kind, &name, &seriesName, &index, &parent, &seriesID, &seasonID); err != nil {
				return nil, err
			}
			id = NormalizeID(id)
			parts := strings.Split(kind, ".")
			kind = parts[len(parts)-1]
			item := map[string]any{"Id": id, "Path": physical, "Type": kind, "Name": nil, "SeriesName": nil, "IndexNumber": nil, "ParentIndexNumber": nil, "SeriesId": nil, "SeasonId": nil}
			for key, value := range map[string]sql.NullString{"Name": name, "SeriesName": seriesName, "SeriesId": seriesID, "SeasonId": seasonID} {
				if value.Valid {
					item[key] = value.String
				}
			}
			if index.Valid {
				item["IndexNumber"] = float64(index.Int64)
			}
			if parent.Valid {
				item["ParentIndexNumber"] = float64(parent.Int64)
			}
			exact[physical] = item
			if kind == "Season" && seriesID.Valid && seriesID.String != "" {
				key := NormalizeID(seriesID.String)
				if seasonCounts[key] == nil {
					seasonCounts[key] = map[string]bool{}
				}
				seasonCounts[key][id] = true
			}
			if kind == "Episode" {
				for _, parent := range []sql.NullString{seriesID, seasonID} {
					if parent.Valid && parent.String != "" {
						counts[NormalizeID(parent.String)]++
					}
				}
			}
			if kind == "Movie" {
				directory := path.Dir(physical)
				movies[directory] = append(movies[directory], item)
			}
		}
		if err = rows.Err(); err != nil {
			return nil, err
		}
		for _, item := range exact {
			if item["Type"] == "Series" || item["Type"] == "Season" {
				item["episodeCount"] = counts[text(item["Id"])]
			}
			if item["Type"] == "Series" {
				item["seasonCount"] = len(seasonCounts[text(item["Id"])])
			}
		}
		i.exact, i.movies, i.at = exact, movies, time.Now()
	}
	direct := i.exact[physical]
	if direct != nil {
		kind := direct["Type"]
		if directory && (kind == "Series" || kind == "Season") || !directory && (kind == "Movie" || kind == "Episode") {
			return direct, nil
		}
	}
	parent := physical
	if !directory {
		parent = path.Dir(physical)
	}
	group := i.movies[parent]
	if (directory || video) && len(group) > 0 {
		names := map[string]bool{}
		for _, item := range group {
			names[text(item["Name"])] = true
		}
		if len(names) == 1 {
			return group[0], nil
		}
	}
	return nil, nil
}

type Catalog struct {
	Index    MediaIndex
	Details  cache.Cache
	GetItem  func(context.Context, string) (map[string]any, error)
	ImageURL func(context.Context, string, string, Access, string) (string, error)
	ItemURL  func(context.Context, string) (string, error)
}

func (c *Catalog) detail(ctx context.Context, id string) (map[string]any, error) {
	if id == "" {
		return map[string]any{}, nil
	}
	return c.Details.Get(ctx, id, time.Minute, false, func(ctx context.Context) (map[string]any, error) {
		value, err := c.GetItem(ctx, id)
		if err != nil {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			return map[string]any{}, nil
		}
		return value, nil
	})
}

var tmdbNumber = regexp.MustCompile(`^\d+$`)

func tmdbID(info map[string]any) string {
	providers := object(info["ProviderIds"])
	for _, key := range []string{"Tmdb", "TMDB", "tmdb"} {
		if value := text(providers[key]); tmdbNumber.MatchString(value) {
			return value
		}
	}
	return ""
}

var overviewHTML = regexp.MustCompile(`<[^>]*>`)

func (c *Catalog) Describe(ctx context.Context, physical string, entry map[string]any, access Access) (map[string]any, error) {
	if physical == "" {
		return nil, nil
	}
	item, err := c.Index.Find(ctx, physical, entry["is_dir"] == true, IsMediaVideo(text(entry["name"])))
	if err != nil || item == nil {
		return nil, err
	}
	info := map[string]any{}
	for k, v := range item {
		info[k] = v
	}
	detail, err := c.detail(ctx, text(item["Id"]))
	if err != nil {
		return nil, err
	}
	for k, v := range detail {
		info[k] = v
	}
	kind := text(item["Type"])
	imageTags := object(info["ImageTags"])
	ownPoster := text(imageTags["Primary"])
	imageID, imageTag := "", ""
	if ownPoster != "" {
		imageID = text(item["Id"])
		imageTag = ownPoster
	} else {
		imageID = text(info["ParentPrimaryImageItemId"])
		if imageID == "" {
			imageID = text(info["SeriesId"])
		}
		imageTag = text(info["ParentPrimaryImageTag"])
		if imageTag == "" {
			imageTag = text(info["SeriesPrimaryImageTag"])
		}
	}
	backdrops, parents := list(info["BackdropImageTags"]), list(info["ParentBackdropImageTags"])
	backdropID, backdropTag := "", ""
	if len(backdrops) > 0 {
		backdropID = text(item["Id"])
		backdropTag = text(backdrops[0])
	} else if len(parents) > 0 {
		backdropID = text(info["ParentBackdropItemId"])
		backdropTag = text(parents[0])
	}
	seriesID, seasonID := NormalizeID(text(info["SeriesId"])), NormalizeID(text(info["SeasonId"]))
	series, season := map[string]any{}, map[string]any{}
	if kind == "Season" || kind == "Episode" {
		series, err = c.detail(ctx, seriesID)
		if err != nil {
			return nil, err
		}
	}
	if kind == "Episode" {
		season, err = c.detail(ctx, seasonID)
		if err != nil {
			return nil, err
		}
	}
	overview := overviewHTML.ReplaceAllString(text(info["Overview"]), "")
	if runes := []rune(overview); len(runes) > 1400 {
		overview = string(runes[:1400])
	}
	scope := seriesID
	if scope == "" {
		scope = text(item["Id"])
	}
	out := map[string]any{"title": MediaTitle(info), "type": kind, "collectionScope": scope, "overview": overview}
	for from, to := range map[string]string{"seasonCount": "seasonCount", "episodeCount": "episodeCount"} {
		if value, ok := item[from]; ok {
			out[to] = value
		}
	}
	for from, to := range map[string]string{"ProductionYear": "year", "IndexNumber": "index", "ParentIndexNumber": "season"} {
		if value, ok := info[from]; ok {
			out[to] = value
		}
	}
	if ticks := number(info["RunTimeTicks"]); ticks != 0 {
		out["duration"] = math.Round(ticks / 600000000)
	}
	if imageID != "" && imageTag != "" {
		image, err := c.ImageURL(ctx, imageID, imageTag, access, "Primary")
		if err != nil {
			return nil, err
		}
		out["image"], out["poster"], out["posterKey"] = image, image, jsonString([]string{NormalizeID(imageID), imageTag})
	}
	if kind == "Episode" {
		tag := ""
		for _, value := range []string{text(object(season["ImageTags"])["Primary"]), text(season["ParentPrimaryImageTag"]), text(object(series["ImageTags"])["Primary"]), text(info["SeriesPrimaryImageTag"])} {
			if tag == "" {
				tag = value
			}
		}
		id := seriesID
		if text(object(season["ImageTags"])["Primary"]) != "" {
			id = seasonID
		} else if text(season["ParentPrimaryImageItemId"]) != "" {
			id = text(season["ParentPrimaryImageItemId"])
		}
		delete(out, "poster")
		delete(out, "posterKey")
		if id != "" && tag != "" {
			poster, err := c.ImageURL(ctx, id, tag, access, "Primary")
			if err != nil {
				return nil, err
			}
			out["poster"], out["posterKey"] = poster, jsonString([]string{NormalizeID(id), tag})
		}
	}
	if backdropID != "" && backdropTag != "" {
		image, err := c.ImageURL(ctx, backdropID, backdropTag, access, "Backdrop")
		if err != nil {
			return nil, err
		}
		out["backdrop"] = image
	}
	if c.ItemURL != nil {
		uri, err := c.ItemURL(ctx, text(item["Id"]))
		if err != nil {
			return nil, err
		}
		out["jellyfinUrl"] = uri
	}
	provider := tmdbID(info)
	if kind == "Season" || kind == "Episode" {
		provider = tmdbID(series)
	}
	if provider != "" {
		category := "tv"
		if kind == "Movie" {
			category = "movie"
		}
		uri := "https://www.themoviedb.org/" + category + "/" + provider
		seasonNumber := info["IndexNumber"]
		if kind == "Episode" {
			seasonNumber = info["ParentIndexNumber"]
		}
		if kind == "Season" && seasonNumber != nil {
			uri += "/season/" + numeric(number(seasonNumber))
		} else if kind == "Episode" && seasonNumber != nil && info["IndexNumber"] != nil {
			uri += "/season/" + numeric(number(seasonNumber)) + "/episode/" + numeric(number(info["IndexNumber"]))
		}
		out["tmdbUrl"] = uri
	}
	return out, nil
}

type Ancestor struct{ Path, Physical string }
type Listing struct {
	Physical  string
	Meta      map[string]any
	Children  []map[string]any
	Access    Access
	Ancestors []Ancestor
	ChildPath func(context.Context, map[string]any) (string, error)
	Siblings  func(context.Context) ([]map[string]any, error)
}

func (c *Catalog) Listing(ctx context.Context, input Listing) (map[string]any, error) {
	current, err := c.Describe(ctx, input.Physical, input.Meta, input.Access)
	if err != nil {
		return nil, err
	}
	breadcrumbs := []map[string]any{}
	for _, ancestor := range input.Ancestors {
		media, err := c.Describe(ctx, ancestor.Physical, map[string]any{"name": path.Base(ancestor.Path), "is_dir": true}, input.Access)
		if err != nil {
			return nil, err
		}
		row := map[string]any{"path": ancestor.Path}
		if media != nil {
			row["media"] = media
		}
		breadcrumbs = append(breadcrumbs, row)
	}
	entries := make([]map[string]any, len(input.Children))
	var cursor int
	var failure error
	var mu sync.Mutex
	var wg sync.WaitGroup
	workers := len(input.Children)
	if workers > 4 {
		workers = 4
	}
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				mu.Lock()
				index := cursor
				cursor++
				failed := failure != nil
				mu.Unlock()
				if failed || index >= len(input.Children) {
					return
				}
				entry := input.Children[index]
				if entry["is_dir"] != true && IsSidecar(text(entry["name"])) {
					continue
				}
				physical, err := input.ChildPath(ctx, entry)
				var media map[string]any
				if err == nil {
					media, err = c.Describe(ctx, physical, entry, input.Access)
				}
				if err != nil {
					mu.Lock()
					failure = err
					mu.Unlock()
					return
				}
				row := map[string]any{"name": entry["name"]}
				if media != nil {
					row["media"] = media
				}
				entries[index] = row
			}
		}()
	}
	wg.Wait()
	if failure != nil {
		return nil, failure
	}
	filtered := []map[string]any{}
	videos := []string{}
	seasons := []string{}
	for index, entry := range input.Children {
		if entry["is_dir"] != true && IsMediaVideo(text(entry["name"])) {
			videos = append(videos, text(entry["name"]))
		}
		if row := entries[index]; row != nil {
			filtered = append(filtered, row)
			if entry["is_dir"] == true && object(row["media"])["type"] == "Season" {
				seasons = append(seasons, text(entry["name"]))
			}
		}
	}
	collapse := false
	if input.Meta["is_dir"] != true && current["type"] == "Movie" && input.Siblings != nil {
		if siblings, err := input.Siblings(ctx); err == nil {
			files := []string{}
			for _, entry := range siblings {
				if entry["is_dir"] != true && IsMediaVideo(text(entry["name"])) {
					files = append(files, text(entry["name"]))
				}
			}
			collapse = len(files) == 1 && files[0] == text(input.Meta["name"])
		}
	}
	out := map[string]any{"breadcrumbs": breadcrumbs, "entries": filtered, "collapseMovieParent": collapse}
	if current != nil {
		out["current"] = current
	}
	if input.Meta["is_dir"] == true && current["type"] == "Series" && number(current["seasonCount"]) == 1 && len(seasons) == 1 {
		out["autoDirectory"] = seasons[0]
	}
	if input.Meta["is_dir"] == true && current["type"] == "Movie" && len(videos) == 1 {
		out["autoFile"] = videos[0]
	}
	return out, nil
}
