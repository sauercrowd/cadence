package workspace

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestTaskDocumentLifecycle(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	task, err := store.CreateTask("Design worker")
	if err != nil {
		t.Fatal(err)
	}
	document, err := store.CreateDocument(task.ID, "Product brief")
	if err != nil {
		t.Fatal(err)
	}
	if document.Filename != "product-brief.md" {
		t.Fatalf("unexpected filename: %s", document.Filename)
	}

	saved, err := store.UpdateDocument(task.ID, document.ID, "# Product brief\n\nHello.\n", document.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Content != "# Product brief\n\nHello.\n" {
		t.Fatalf("unexpected content: %q", saved.Content)
	}
	if _, err := store.UpdateDocument(task.ID, document.ID, "stale", document.Revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}

	renamed, err := store.RenameDocument(task.ID, document.ID, "Outcome")
	if err != nil {
		t.Fatal(err)
	}
	if renamed.Filename != "outcome.md" {
		t.Fatalf("unexpected renamed filename: %s", renamed.Filename)
	}
	if _, err := os.Stat(filepath.Join(store.tasksDir, task.ID, "product-brief.md")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("old document still exists: %v", err)
	}

	if err := store.DeleteDocument(task.ID, document.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteTask(task.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetDocument(task.ID, document.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected deleted task to be missing, got %v", err)
	}
}

func TestDocumentNamesAreUnique(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	task, _ := store.CreateTask("Task")
	first, _ := store.CreateDocument(task.ID, "Notes")
	second, _ := store.CreateDocument(task.ID, "Notes")
	if first.Filename != "notes.md" || second.Filename != "notes-2.md" {
		t.Fatalf("unexpected filenames: %s, %s", first.Filename, second.Filename)
	}
}

func TestAttachmentLifecycle(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	task, err := store.CreateTask("Task")
	if err != nil {
		t.Fatal(err)
	}
	png := []byte{0x89, 0x50, 0x4e, 0x47}
	name, err := store.CreateAttachment(task.ID, "shot.png", "image/png", png)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Ext(name) != ".png" {
		t.Fatalf("unexpected attachment name: %s", name)
	}
	contentType, data, err := store.ReadAttachment(task.ID, name)
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "image/png" || string(data) != string(png) {
		t.Fatalf("unexpected attachment: %s %v", contentType, data)
	}
	if !InlineAttachment(contentType) {
		t.Fatal("images should preview inline")
	}

	// Videos keep their extension for inline previews too.
	clip, err := store.CreateAttachment(task.ID, "clip.mp4", "video/mp4", []byte{0, 0, 0})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Ext(clip) != ".mp4" {
		t.Fatalf("unexpected attachment name: %s", clip)
	}
	if contentType, _, err := store.ReadAttachment(task.ID, clip); err != nil || contentType != "video/mp4" || !InlineAttachment(contentType) {
		t.Fatalf("unexpected video attachment: %s %v", contentType, err)
	}

	// Anything else is stored as a download: HTML must never render inline.
	page, err := store.CreateAttachment(task.ID, "page.html", "text/html", []byte("<b>"))
	if err != nil {
		t.Fatal(err)
	}
	if contentType, _, err := store.ReadAttachment(task.ID, page); err != nil || contentType != "text/html" || InlineAttachment(contentType) {
		t.Fatalf("unexpected download attachment: %s %v", contentType, err)
	}

	// A useless filename falls back to the content type, then to a download.
	fallback, err := store.CreateAttachment(task.ID, "weird", "image/png", png)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Ext(fallback) != ".png" {
		t.Fatalf("unexpected attachment name: %s", fallback)
	}
	unknown, err := store.CreateAttachment(task.ID, "data", "", png)
	if err != nil {
		t.Fatal(err)
	}
	if contentType, _, err := store.ReadAttachment(task.ID, unknown); err != nil || contentType != "application/octet-stream" || InlineAttachment(contentType) {
		t.Fatalf("unexpected unknown attachment: %s %v", contentType, err)
	}

	if _, err := store.CreateAttachment(task.ID, "shot.png", "image/png", nil); !errors.Is(err, ErrFileTooLarge) {
		t.Fatalf("expected empty file rejection, got %v", err)
	}
	if _, _, err := store.ReadAttachment(task.ID, "../task.json"); err == nil {
		t.Fatal("expected traversal to be rejected")
	}
	if _, _, err := store.ReadAttachment(task.ID, "missing.png"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected missing attachment, got %v", err)
	}
}
