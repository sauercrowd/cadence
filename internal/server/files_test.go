package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/sauercrowd/worker/internal/workspace"
)

func TestWorkspaceLogoEndpoint(t *testing.T) {
	root := t.TempDir()
	store, err := workspace.NewStore(root)
	if err != nil {
		t.Fatal(err)
	}

	// No logo configured: the UI falls back to the letter avatar.
	request := httptest.NewRequest("GET", "/api/workspace/logo", nil)
	recorder := httptest.NewRecorder()
	NewFilesHandler(store).ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 without a logo, got %d", recorder.Code)
	}

	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	if err := os.MkdirAll(filepath.Join(root, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets", "logo.png"), png, 0o644); err != nil {
		t.Fatal(err)
	}
	// Configure the logo the way a user would: straight in workspace.json.
	info := store.Info()
	info.LogoPath = "assets/logo.png"
	raw, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".cadence", "workspace.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	configured, err := workspace.NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	recorder = httptest.NewRecorder()
	NewFilesHandler(configured).ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 with a logo, got %d", recorder.Code)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "image/png" {
		t.Fatalf("unexpected content type: %s", contentType)
	}
	if !bytes.Equal(recorder.Body.Bytes(), png) {
		t.Fatal("logo body mismatch")
	}
}
