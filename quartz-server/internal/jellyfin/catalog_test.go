package jellyfin

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"testing"
)

func TestCatalogLegacyContract(t *testing.T) {
	raw, err := os.ReadFile("testdata/catalog.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Rows  [][]any                   `json:"rows"`
		Info  map[string]map[string]any `json:"info"`
		Cases []struct {
			Physical  string           `json:"physical"`
			Meta      map[string]any   `json:"meta"`
			Children  []map[string]any `json:"children"`
			Ancestors []Ancestor       `json:"ancestors"`
			Expected  map[string]any   `json:"expected"`
		} `json:"cases"`
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "library.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec("CREATE TABLE BaseItems(Id TEXT,Path TEXT,Type TEXT,Name TEXT,SeriesName TEXT,IndexNumber INTEGER,ParentIndexNumber INTEGER,SeriesId TEXT,SeasonId TEXT)"); err != nil {
		t.Fatal(err)
	}
	for _, row := range fixture.Rows {
		if _, err = db.Exec("INSERT INTO BaseItems VALUES(?,?,?,?,?,?,?,?,?)", row...); err != nil {
			t.Fatal(err)
		}
	}
	catalog := Catalog{Index: MediaIndex{DB: db}, GetItem: func(ctx context.Context, id string) (map[string]any, error) { return fixture.Info[id], nil }, ImageURL: func(ctx context.Context, id, tag string, access Access, kind string) (string, error) {
		uri := "https://proxy.test/image/" + id
		if kind != "" && kind != "Primary" {
			uri += "/" + kind
		}
		return uri, nil
	}, ItemURL: func(ctx context.Context, id string) (string, error) {
		return "https://media.test/web/#/details?id=" + id, nil
	}}
	for index, c := range fixture.Cases {
		value, err := catalog.Listing(context.Background(), Listing{Physical: c.Physical, Meta: c.Meta, Children: c.Children, Ancestors: c.Ancestors, ChildPath: func(ctx context.Context, entry map[string]any) (string, error) {
			return path.Join(c.Physical, text(entry["name"])), nil
		}})
		if err != nil {
			t.Fatal(index, err)
		}
		encoded, _ := json.Marshal(value)
		var normalized map[string]any
		json.Unmarshal(encoded, &normalized)
		if !reflect.DeepEqual(normalized, c.Expected) {
			t.Fatalf("catalog case %d differs\n%s\nexpected %v", index, encoded, c.Expected)
		}
	}
}
func TestCollectionShareBoundaries(t *testing.T) {
	for _, test := range []struct{ physical, root, prefix, want string }{{"/media/Movies/Two/two.mkv", "/media/Movies", "", "/Two/two.mkv"}, {"/media/Movies-other/file.mkv", "/media/Movies", "", ""}, {"/private/file.mkv", "/media/Movies", "", ""}, {"/media/Movies/Two/two.mkv", "/media/Movies", "Movies", "/Movies/Two/two.mkv"}, {"/media/file.mkv", "/media/file.mkv", "", "/"}} {
		if got := CollectionSharePath(test.physical, []ShareRoot{{test.root, test.prefix}}); got != test.want {
			t.Fatal(test, got)
		}
	}
}

func TestCollectionMetadataBatchCache(t *testing.T) {
	var catalog CollectionCatalog
	calls := 0
	load := func(ctx context.Context, ids []string) ([]any, error) {
		calls++
		values := []any{}
		for _, id := range ids {
			values = append(values, map[string]any{"Id": id, "Name": "title"})
		}
		return values, nil
	}
	for _, ids := range [][]string{{"one", "two"}, {"two"}, {"one", "three"}} {
		value, err := catalog.items(context.Background(), ids, load)
		if err != nil || len(value) != len(ids) {
			t.Fatal(value, err)
		}
	}
	if calls != 2 {
		t.Fatal("cached collection metadata fetched again", calls)
	}
}
