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
