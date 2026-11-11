package httpapi

import (
	"encoding/json"
	"errors"
	"goblincwl/quartz-server/internal/jellyfin"
	"io"
	"net/http"
	"strings"
)

type mediaResponse struct {
	http.ResponseWriter
	written bool
}

func (w *mediaResponse) WriteHeader(status int) {
	w.written = true
	w.ResponseWriter.WriteHeader(status)
}
func (w *mediaResponse) Write(value []byte) (int, error) {
	w.written = true
	return w.ResponseWriter.Write(value)
}
func (w *mediaResponse) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (s *Server) jellyfin(mux *http.ServeMux) {
	if s.Jellyfin == nil {
		return
	}
	const prefix = "/api/public/quartz/jellyfin/"
	mux.HandleFunc(prefix, func(original http.ResponseWriter, r *http.Request) {
		w := &mediaResponse{ResponseWriter: original}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, HEAD, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, prefix)
		parts := strings.Split(path, "/")
		var data map[string]any
		var err error
		switch {
		case path == "player" && r.Method == "GET":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Security-Policy", "frame-ancestors "+s.Origin)
			w.Header().Set("Referrer-Policy", "no-referrer")
			io.WriteString(w, jellyfin.PlayerDocument(s.Origin))
			return
		case len(parts) == 2 && parts[0] == "image" && r.Method == "GET":
			err = s.Jellyfin.ServeImage(w, r, parts[1])
		case len(parts) == 3 && parts[0] == "bitrate-test" && r.Method == "GET":
			err = s.Jellyfin.BitrateTest(w, r, parts[1], parts[2])
		case len(parts) == 4 && parts[0] == "subtitle" && (r.Method == "GET" || r.Method == "HEAD"):
			err = s.Jellyfin.Subtitle(w, r, parts[1], parts[2], parts[3])
		case len(parts) == 3 && parts[0] == "stream" && (r.Method == "GET" || r.Method == "HEAD"):
			err = s.Jellyfin.Stream(w, r, parts[1], parts[2])
		case r.Method != "POST":
			w.WriteHeader(405)
			return
		default:
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 65536))
			defer r.Body.Close()
			var input map[string]any
			if err = decoder.Decode(&input); err == io.EOF {
				input = map[string]any{}
				err = nil
			}
			if err == nil {
				if decoder.Decode(new(any)) != io.EOF {
					err = errors.New("请求格式不正确")
				}
			}
			if err != nil {
				break
			}
			switch path {
			case "lookup":
				data, err = s.Jellyfin.Lookup(r.Context(), input, r.Header.Get("Authorization"))
			case "playback":
				data, err = s.Jellyfin.Playback(r.Context(), input)
			case "media":
				data, err = s.Jellyfin.MediaListing(r.Context(), input)
			case "collections":
				data, err = s.Jellyfin.Collections(r.Context(), input)
			case "aliases":
				data, err = s.Jellyfin.Aliases(r.Context(), input, r.Header.Get("Authorization"))
			case "danmaku":
				data, err = s.Jellyfin.DanmakuRequest(r.Context(), input, r.Header.Get("Authorization"))
			case "stop":
				id, _ := input["session"].(string)
				s.Jellyfin.Stop(id)
				data = map[string]any{}
			default:
				w.WriteHeader(404)
				return
			}
		}
		if err != nil {
			if w.written {
				panic(http.ErrAbortHandler)
			}
			JSON(w, 400, map[string]any{"code": 400, "message": err.Error()})
			return
		}
		if data != nil {
			JSON(w, 200, map[string]any{"code": 200, "data": data})
		}
	})
}
