package workspace

import (
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestJSONImportIsAtomicAndIdempotent(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, ".cadence")
	id := uuid.NewString()
	taskDir := filepath.Join(dir, "tasks", id)
	if err := os.MkdirAll(taskDir, 0o755); err != nil {
		t.Fatal(err)
	}
	w := defaultWorkflow()
	for i := range w.Phases {
		w.Phases[i].Number = 0
	}
	raw, _ := json.Marshal(w)
	if err := os.WriteFile(filepath.Join(dir, "workflow.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	legacy := Task{SchemaVersion: 1, ID: id, Name: "Imported", Status: "open", Priority: 2, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	for _, p := range w.Phases {
		doc := DocumentSummary{ID: uuid.NewString(), Name: p.Name, Filename: p.ID + ".md"}
		legacy.Documents = append(legacy.Documents, doc)
		legacy.Phases = append(legacy.Phases, TaskPhase{PhaseID: p.ID, DocumentID: doc.ID})
		if err := os.WriteFile(filepath.Join(taskDir, doc.Filename), []byte("original Markdown\n"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	legacy.CurrentPhaseID = "goal"
	original, _ := json.Marshal(legacy)
	manifest := filepath.Join(taskDir, "task.json")
	if err := os.WriteFile(manifest, []byte("broken"), 0o644); err != nil {
		t.Fatal(err)
	}
	if s, err := NewStore(root); err == nil {
		s.Close()
		t.Fatal("invalid import should fail")
	}
	if err := os.WriteFile(manifest, original, 0o644); err != nil {
		t.Fatal(err)
	}
	s, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	imported, err := s.GetTask(id)
	if err != nil {
		t.Fatal(err)
	}
	if imported.Number != 1 || len(imported.Documents) != 4 {
		t.Fatalf("bad import: %+v", imported)
	}
	saved, err := s.RenameTask(id, "Changed in SQLite")
	if err != nil {
		t.Fatal(err)
	}
	if saved.Revision == imported.Revision {
		t.Fatal("metadata revision did not change")
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s, err = NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	loaded, err := s.GetTask(id)
	if err != nil || loaded.Name != "Changed in SQLite" {
		t.Fatalf("reimport overwrote database: %+v %v", loaded, err)
	}
	bytes, err := os.ReadFile(manifest)
	if err != nil || string(bytes) != string(original) {
		t.Fatal("legacy JSON changed")
	}
	doc, err := s.GetDocument(id, loaded.Documents[0].ID)
	if err != nil || doc.Content != "original Markdown\n" {
		t.Fatal("Markdown changed during import")
	}
}

func TestNumbersAndSubphasesPersist(t *testing.T) {
	root := t.TempDir()
	s, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	first, err := s.CreateTask("First")
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateTask("Second")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteTask(second.ID); err != nil {
		t.Fatal(err)
	}
	third, err := s.CreateTask("Third")
	if err != nil {
		t.Fatal(err)
	}
	if third.Number <= second.Number {
		t.Fatal("deleted task number reused")
	}
	w, _ := s.GetWorkflow()
	number := w.Phases[2].Number
	w.Phases[0], w.Phases[2] = w.Phases[2], w.Phases[0]
	w, err = s.UpdateWorkflow(w, w.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if w.Phases[0].Number != number {
		t.Fatal("reorder changed phase ID")
	}
	removed := w.Phases[len(w.Phases)-1].Number
	w.Phases = w.Phases[:len(w.Phases)-1]
	w, err = s.UpdateWorkflow(w, w.Revision)
	if err != nil {
		t.Fatal(err)
	}
	w.Phases = append(w.Phases, PhaseDefinition{ID: "extra", Name: "Extra", Mode: "async"})
	w, err = s.UpdateWorkflow(w, w.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if w.Phases[len(w.Phases)-1].Number <= removed {
		t.Fatal("phase number reused")
	}
	first, err = s.GetTask(first.ID)
	if err != nil {
		t.Fatal(err)
	}
	first, err = s.CreateSubphase(first.ID, "implement", "Build storage", first.Revision)
	if err != nil {
		t.Fatal(err)
	}
	sub := first.Subphases[0]
	if len(first.Subphases) != 1 || sub.Done {
		t.Fatal("invalid new subphase")
	}
	completed, err := s.UpdateSubphase(first.ID, sub.Number, true, first.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateSubphase(first.ID, sub.Number, false, first.Revision); !errors.Is(err, ErrConflict) {
		t.Fatal("stale subphase write accepted")
	}
	if err := s.DeleteDocument(first.ID, sub.DocumentID); err == nil {
		t.Fatal("subphase document deleted")
	}
	other, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	restored, err := other.GetTask(first.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !restored.Subphases[0].Done || restored.Revision != completed.Revision {
		t.Fatal("subphase did not persist")
	}
}

func TestConcurrentStoresAllocateUniqueNumbers(t *testing.T) {
	root := t.TempDir()
	a, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	numbers := make(chan int, 12)
	errs := make(chan error, 12)
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s := a
			if i%2 == 0 {
				s = b
			}
			task, err := s.CreateTask("Concurrent")
			if err != nil {
				errs <- err
			} else {
				numbers <- task.Number
			}
		}(i)
	}
	wg.Wait()
	close(numbers)
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	seen := map[int]bool{}
	for n := range numbers {
		if seen[n] {
			t.Errorf("duplicate number %d", n)
		}
		seen[n] = true
	}
	if len(seen) != 12 {
		t.Fatalf("created %d tasks", len(seen))
	}
}

func TestPhaseLinks(t *testing.T) {
	root := t.TempDir()
	s, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	task, err := s.CreateTask("Linked")
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://"} {
		if _, err := s.CreatePhaseLink(task.ID, "goal", bad, "", task.Revision); !errors.Is(err, ErrInvalidName) {
			t.Fatalf("accepted %q: %v", bad, err)
		}
	}
	if _, err := s.CreatePhaseLink(task.ID, "nope", "https://example.com", "", task.Revision); !errors.Is(err, ErrInvalidName) {
		t.Fatal("accepted unknown phase")
	}
	task, err = s.CreatePhaseLink(task.ID, "goal", "https://example.com/spec", "Spec", task.Revision)
	if err != nil {
		t.Fatal(err)
	}
	task, err = s.CreatePhaseLink(task.ID, "goal", "https://example.com/pr", "", task.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Links) != 2 || task.Links[0].Title != "Spec" || task.Links[1].Number == task.Links[0].Number {
		t.Fatalf("bad links: %+v", task.Links)
	}
	if _, err := s.CreatePhaseLink(task.ID, "goal", "https://example.com/stale", "", "outdated"); !errors.Is(err, ErrConflict) {
		t.Fatal("stale link write accepted")
	}
	first := task.Links[0].Number
	task, err = s.DeletePhaseLink(task.ID, first, task.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Links) != 1 || task.Links[0].Number == first {
		t.Fatalf("delete removed the wrong link: %+v", task.Links)
	}
	if _, err := s.DeletePhaseLink(task.ID, first, task.Revision); !errors.Is(err, ErrNotFound) {
		t.Fatal("deleted a link twice")
	}
	other, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	reloaded, err := other.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded.Links) != 1 || reloaded.Links[0].URL != "https://example.com/pr" || reloaded.Revision != task.Revision {
		t.Fatalf("links did not persist: %+v", reloaded.Links)
	}
}
