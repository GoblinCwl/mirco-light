package content

import (
	"context"
	"strings"
)

type KnowledgeWorkRef struct {
	WorkID string `json:"work_id"`
	Type   string `json:"type"`
	Title  string `json:"title"`
	URL    string `json:"source_url"`
}

type KnowledgeSummary struct {
	KnowledgeWorkRef
	Directory   string   `json:"directory"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	PublishedAt *string  `json:"published_at"`
	UpdatedAt   *string  `json:"updated_at"`
}

type KnowledgeWork struct {
	KnowledgeSummary
	Links     []KnowledgeWorkRef `json:"links"`
	Backlinks []KnowledgeWorkRef `json:"backlinks"`
}

// LookupKnowledgeWork exposes public records and their public relationships.
func (s Store) LookupKnowledgeWork(ctx context.Context, id string) (*KnowledgeWork, error) {
	records, err := s.knowledgeRecords(ctx, "", nil)
	if err != nil {
		return nil, err
	}
	for _, record := range records {
		if record.ID == id {
			return knowledgeRelations(records, record, s.Origin), nil
		}
	}
	return nil, nil
}

func knowledgeRef(record Record, origin string) KnowledgeWorkRef {
	return KnowledgeWorkRef{WorkID: record.ID, Type: record.Type, Title: record.Title, URL: strings.TrimRight(origin, "/") + record.Href}
}

func knowledgeSummary(record Record, origin string) KnowledgeSummary {
	return KnowledgeSummary{
		KnowledgeWorkRef: knowledgeRef(record, origin), Directory: knowledgeDirectory(record.Slug),
		Description: excerpt(clip(record.Description, 300)), Tags: record.Tags, PublishedAt: record.Published, UpdatedAt: record.Updated,
	}
}

func knowledgeRelations(records []Record, target Record, origin string) *KnowledgeWork {
	result := &KnowledgeWork{
		KnowledgeSummary: knowledgeSummary(target, origin),
		Links:            []KnowledgeWorkRef{}, Backlinks: []KnowledgeWorkRef{},
	}
	routes := relationRoutes(records, "", nil)
	targetSlug := relationKey(target.Slug)
	outgoing := map[string]bool{}
	for _, link := range target.Links {
		if slug, ok := routes[relationKey(link)]; ok {
			outgoing[slug] = true
		}
	}
	for _, record := range records {
		if record.ID == target.ID {
			continue
		}
		if outgoing[relationKey(record.Slug)] {
			result.Links = append(result.Links, knowledgeRef(record, origin))
		}
		for _, link := range record.Links {
			if slug, ok := routes[relationKey(link)]; ok && slug == targetSlug {
				result.Backlinks = append(result.Backlinks, knowledgeRef(record, origin))
				break
			}
		}
	}
	return result
}
