package workspace

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestTaskStateAndWorkflowSnapshot(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.CreateTask("Workflow")
	if err != nil {
		t.Fatal(err)
	}
	if task.Status != "open" || task.Priority != 2 || task.AgentStatus != nil || len(task.Phases) != 4 {
		t.Fatalf("unexpected defaults: %+v", task)
	}
	working := "working"
	task, err = s.UpdateTask(task.ID, task.Revision, TaskUpdate{Status: "focus", AgentStatus: &working, Fields: []string{"status", "agent_status"}})
	if err != nil {
		t.Fatal(err)
	}
	oldRevision := task.Revision
	task, err = s.UpdateTask(task.ID, task.Revision, TaskUpdate{Status: "archived", Fields: []string{"status"}})
	if err != nil {
		t.Fatal(err)
	}
	if task.AgentStatus == nil {
		t.Fatal("archiving must not imply agent cancellation")
	}
	if _, err := s.UpdateTask(task.ID, oldRevision, TaskUpdate{Status: "focus", Fields: []string{"status"}}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale status update: %v", err)
	}
	// Archived is just a status: leaving it is an ordinary status change.
	task, err = s.UpdateTask(task.ID, task.Revision, TaskUpdate{Status: "focus", Fields: []string{"status"}})
	if err != nil || task.Status != "focus" {
		t.Fatalf("unarchive: %v %+v", err, task)
	}
	w, _ := s.GetWorkflow()
	w.Phases[0].Name = "New goal name"
	if _, err := s.UpdateWorkflow(w, w.Revision); err != nil {
		t.Fatal(err)
	}
	task, _ = s.GetTask(task.ID)
	if task.Phases[0].Definition.Name != "New goal name" {
		t.Fatal("tasks must always reflect the latest workflow definition")
	}
	if _, err := s.UpdateTask(task.ID, "", TaskUpdate{Fields: []string{"status"}, Status: "done"}); !errors.Is(err, ErrConflict) {
		t.Fatal("revision must be mandatory")
	}
}

func TestPhasesFollowWorkflowChanges(t *testing.T) {
	s, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.CreateTask("Sync")
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Phases) != 4 {
		t.Fatalf("expected 4 phases: %+v", task.Phases)
	}
	original := task.Documents

	w, _ := s.GetWorkflow()
	removedID := w.Phases[0].ID
	w.Phases = append(w.Phases[1:], PhaseDefinition{ID: "extra", Name: "Extra phase", Mode: "interactive", DocumentTemplate: "# Extra\n"})
	if _, err := s.UpdateWorkflow(w, w.Revision); err != nil {
		t.Fatal(err)
	}

	task, err = s.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Phases) != 4 {
		t.Fatalf("expected the task to keep 4 phases after sync: %+v", task.Phases)
	}
	for _, p := range task.Phases {
		if p.PhaseID == removedID {
			t.Fatal("removed phase must not remain active")
		}
	}
	if task.Phases[len(task.Phases)-1].PhaseID != "extra" {
		t.Fatal("new workflow phase must be added to existing tasks")
	}
	if len(task.Documents) != len(original)+1 {
		t.Fatal("a new document must be created for the new phase")
	}
	found := false
	for _, d := range task.Documents {
		if !taskHasPhaseDocument(task, d.ID) && d.Name == "Goal planning" {
			found = true
		}
	}
	if !found {
		t.Fatal("the removed phase's document must remain as a supporting document")
	}
	if task.CurrentPhaseID == removedID {
		t.Fatal("current phase must move off a removed phase")
	}
}

func taskHasPhaseDocument(task Task, documentID string) bool {
	for _, p := range task.Phases {
		if p.DocumentID == documentID {
			return true
		}
	}
	return false
}

func TestPhaseSelection(t *testing.T) {
	s, _ := NewStore(t.TempDir())
	task, _ := s.CreateTask("Phase selection")
	phaseID := task.Phases[2].PhaseID
	task, err := s.UpdateTask(task.ID, task.Revision, TaskUpdate{CurrentPhaseID: phaseID, Fields: []string{"current_phase_id"}})
	if err != nil {
		t.Fatal(err)
	}
	if task.CurrentPhaseID != phaseID || task.Status != "open" {
		t.Fatal("phase selection must only change current phase")
	}
	if _, err := s.UpdateTask(task.ID, task.Revision, TaskUpdate{CurrentPhaseID: "missing", Fields: []string{"current_phase_id"}}); !errors.Is(err, ErrInvalidName) {
		t.Fatal("unknown phase should fail")
	}
	doc, _ := s.GetDocument(task.ID, task.Phases[0].DocumentID)
	if _, err := s.UpdateDocument(task.ID, doc.ID, "# Updated goal", doc.Revision); err != nil {
		t.Fatal(err)
	}
	task, _ = s.GetTask(task.ID)
	if task.CurrentPhaseID != phaseID {
		t.Fatal("editing a document changed phase")
	}
}
func TestExternalWritesAndContainment(t *testing.T) {
	root := t.TempDir()
	s, _ := NewStore(root)
	task, _ := s.CreateTask("External")
	doc, _ := s.GetDocument(task.ID, task.Phases[0].DocumentID)
	path := filepath.Join(s.taskDir(task.ID), doc.Filename)
	if err := os.WriteFile(path, []byte("external update"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateDocument(task.ID, doc.ID, "stale update", doc.Revision); !errors.Is(err, ErrConflict) {
		t.Fatalf("external edit conflict: %v", err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "outside.md"), path); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetDocument(task.ID, doc.ID); err == nil {
		t.Fatal("symlink should be rejected")
	}
}

func TestWorkspaceLogo(t *testing.T) {
	root := t.TempDir()
	s, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.WorkspaceLogo(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected no logo by default, got %v", err)
	}

	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	if err := os.MkdirAll(filepath.Join(root, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets", "logo.png"), png, 0o644); err != nil {
		t.Fatal(err)
	}
	s.info.LogoPath = "assets/logo.png"
	contentType, data, err := s.WorkspaceLogo()
	if err != nil {
		t.Fatal(err)
	}
	if contentType != "image/png" || string(data) != string(png) {
		t.Fatalf("unexpected logo: %s %v", contentType, data)
	}

	for _, bad := range []string{"../task.json", "/etc/hostname", "..", "assets/../../x"} {
		s.info.LogoPath = bad
		if _, _, err := s.WorkspaceLogo(); !errors.Is(err, ErrNotFound) {
			t.Fatalf("expected traversal rejection for %q, got %v", bad, err)
		}
	}
	s.info.LogoPath = "assets/missing.png"
	if _, _, err := s.WorkspaceLogo(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected missing logo, got %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets", "notes.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	s.info.LogoPath = "assets/notes.txt"
	if _, _, err := s.WorkspaceLogo(); !errors.Is(err, ErrInvalidFileType) {
		t.Fatalf("expected non-image rejection, got %v", err)
	}
}

func TestWorkspaceLogoPathPersists(t *testing.T) {
	root := t.TempDir()
	first, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	updated := first.Info()
	updated.LogoPath = "assets/logo.png"
	raw, _ := json.MarshalIndent(updated, "", "  ")
	if err := os.WriteFile(filepath.Join(root, ".cadence", "workspace.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	second, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if second.Info().LogoPath != "assets/logo.png" {
		t.Fatalf("logo path did not persist: %+v", second.Info())
	}
}

func TestWorkspaceLogoRejectsSymlinkEscapes(t *testing.T) {
	root, outside := t.TempDir(), t.TempDir()
	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "logo.png"), []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "assets")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "logo.png"), filepath.Join(root, "logo.png")); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"assets/logo.png", "logo.png"} {
		store.info.LogoPath = path
		if _, _, err := store.WorkspaceLogo(); !errors.Is(err, ErrNotFound) {
			t.Fatalf("expected symlink escape rejection for %q, got %v", path, err)
		}
	}
}
