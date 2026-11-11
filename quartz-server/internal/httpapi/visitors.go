package httpapi

import (
	"goblincwl/quartz-server/internal/visitors"
	"net/http"
	"regexp"
	"strconv"
)

var bot = regexp.MustCompile(`(?i)bot|spider|crawler|headless`)

func (s *Server) visitors(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/visitors", func(w http.ResponseWriter, r *http.Request) { s.readVisitors(w, r, false) })
	mux.HandleFunc("GET /api/visitors/records", func(w http.ResponseWriter, r *http.Request) { s.readVisitors(w, r, true) })
	mux.HandleFunc("POST /api/visitors/visit", s.recordVisit)
}
func (s *Server) readVisitors(w http.ResponseWriter, r *http.Request, records bool) {
	if s.Visitors == nil {
		JSON(w, 503, map[string]string{"error": "Visitor statistics temporarily unavailable"})
		return
	}
	identity := s.Visitors.Identity(r.Header.Get("X-Visitor-IP"), r.Header.Get("X-Visitor-ID"))
	var result map[string]any
	var err error
	if records {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		result, err = s.Visitors.Records(r.Context(), page, r.URL.Query().Get("region"), r.URL.Query().Get("day"), identity)
	} else {
		days, _ := strconv.Atoi(r.URL.Query().Get("days"))
		result, err = s.Visitors.Summary(r.Context(), days, identity)
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	JSON(w, 200, result)
}
func (s *Server) recordVisit(w http.ResponseWriter, r *http.Request) {
	if s.Visitors == nil {
		JSON(w, 503, map[string]string{"error": "Visitor statistics temporarily unavailable"})
		return
	}
	if r.Header.Get("Origin") != s.Origin || r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		JSON(w, 403, map[string]string{"error": "Forbidden"})
		return
	}
	ip := visitors.NormalizeIP(r.Header.Get("X-Visitor-IP"))
	browser := r.Header.Get("X-Visitor-ID")
	if ip == "" || browser != "" && !visitors.ValidBrowserID(browser) {
		JSON(w, 400, map[string]string{"error": "Invalid visitor information"})
		return
	}
	if bot.MatchString(r.UserAgent()) {
		JSON(w, 202, map[string]bool{"ignored": true})
		return
	}
	record, err := s.Visitors.Record(r.Context(), ip, browser, r.UserAgent())
	if err != nil {
		s.fail(w, err)
		return
	}
	// Recording is complete. Statistics and historical lists are independent GETs.
	JSON(w, 200, record)
}
