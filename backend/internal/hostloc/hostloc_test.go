package hostloc

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTemp(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "host-location.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write temp config: %v", err)
	}
	return path
}

func TestLoad_Valid(t *testing.T) {
	path := writeTemp(t, `{"country":"JP","label":"日本節點","coordinates":[138,36],"mapZoom":4.5}`)

	loc, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if loc.Country != "JP" {
		t.Errorf("Country = %q, want JP", loc.Country)
	}
	if loc.Label != "日本節點" {
		t.Errorf("Label = %q, want 日本節點", loc.Label)
	}
	if loc.Coordinates != [2]float64{138, 36} {
		t.Errorf("Coordinates = %v, want [138 36]", loc.Coordinates)
	}
	if loc.MapZoom != 4.5 {
		t.Errorf("MapZoom = %v, want 4.5", loc.MapZoom)
	}
	if !loc.HasCoordinates() {
		t.Error("HasCoordinates() = false, want true")
	}
}

func TestLoad_MissingFile(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "nope.json")); err == nil {
		t.Fatal("expected error for missing file, got nil")
	}
}

func TestLoad_InvalidJSON(t *testing.T) {
	path := writeTemp(t, `{"country":`)
	if _, err := Load(path); err == nil {
		t.Fatal("expected parse error, got nil")
	}
}

func TestHasCoordinates_ZeroValue(t *testing.T) {
	loc := &Location{Country: "TW"}
	if loc.HasCoordinates() {
		t.Error("HasCoordinates() = true for zero coords, want false")
	}
}
