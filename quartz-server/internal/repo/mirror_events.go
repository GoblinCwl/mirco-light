package repo

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
)

// Contribution totals are grouped by day and do not identify every push. Use
// GitHub event IDs for mirror invalidation, independently of presentation data.
func CodeEventRevision(raw []byte, owner string) (string, error) {
	var rows []struct {
		ID   string `json:"id"`
		Type string `json:"type"`
		Repo struct {
			Name string `json:"name"`
		} `json:"repo"`
	}
	if err := json.Unmarshal(raw, &rows); err != nil || rows == nil {
		return "", fmt.Errorf("invalid GitHub events")
	}
	latest := "0"
	for _, row := range rows {
		switch row.Type {
		case "PushEvent", "CreateEvent", "DeleteEvent", "PublicEvent", "ReleaseEvent":
		default:
			continue
		}
		parts := strings.Split(row.Repo.Name, "/")
		if len(parts) != 2 || !strings.EqualFold(parts[0], owner) || row.ID == "" {
			continue
		}
		validID := true
		for _, digit := range row.ID {
			if digit < '0' || digit > '9' {
				validID = false
				break
			}
		}
		if !validID {
			return "", fmt.Errorf("invalid GitHub event ID")
		}
		if newerCodeEvent(row.ID, latest) {
			latest = row.ID
		}
	}
	return latest, nil
}

func newerCodeEvent(current, previous string) bool {
	return len(current) > len(previous) || len(current) == len(previous) && current > previous
}

func (s *Social) refreshMirrors(ctx context.Context) error {
	if s.AfterCodeChange == nil {
		return nil
	}
	raw, err := s.Adapter.request(ctx, "https://api.github.com/users/"+url.PathEscape(s.Adapter.Owner)+"/events/public?per_page=100")
	if err != nil {
		return err
	}
	revision, err := CodeEventRevision(raw, s.Adapter.Owner)
	if err != nil {
		return err
	}
	previous, err := s.get(ctx, "mirror-events:v1")
	if err != nil {
		return err
	}
	saved := object(previous)
	activities, err := s.get(ctx, "activities")
	if err != nil {
		return err
	}
	activityRevision := CodeActivityRevision(activities, s.Adapter.Owner)
	eventID := stringValue(saved["eventID"])
	if !newerCodeEvent(revision, eventID) && stringValue(saved["activities"]) == activityRevision {
		return nil
	}
	if err = s.AfterCodeChange(ctx); err != nil {
		return err
	}
	if !newerCodeEvent(revision, eventID) {
		revision = eventID
	}
	// Failed pulls never consume the event. The existing refresh can retry it.
	return s.put(ctx, "mirror-events:v1", map[string]any{"eventID": revision, "activities": activityRevision})
}

// Visible contribution rows can reveal a new repository or a changed daily
// commit total before the public events feed catches up. Ignore issue/review
// records and timestamps belonging only to profile/cache refreshes.
func CodeActivityRevision(value any, owner string) string {
	revisions := []string{}
	for _, raw := range list(value) {
		row := object(raw)
		kind := stringValue(row["kind"])
		if kind != "commit" && kind != "repository" {
			continue
		}
		parts := strings.Split(stringValue(row["repository"]), "/")
		if len(parts) != 2 || !strings.EqualFold(parts[0], owner) {
			continue
		}
		encoded, _ := json.Marshal([]string{stringValue(row["id"]), stringValue(row["text"])})
		revisions = append(revisions, string(encoded))
	}
	sort.Strings(revisions)
	encoded, _ := json.Marshal(revisions)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}
