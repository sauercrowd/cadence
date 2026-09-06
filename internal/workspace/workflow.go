package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

func ensureDirectory(path string) error {
	if err := os.MkdirAll(path, 0o755); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("unsafe workspace directory")
	}
	return nil
}
func safeFile(dir, name string) error {
	if name == "" || name == "." || name == ".." || filepath.Base(name) != name || strings.ContainsAny(name, `/\`) {
		return fmt.Errorf("invalid workspace filename")
	}
	info, err := os.Lstat(filepath.Join(dir, name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("workspace symlinks are not supported")
	}
	return nil
}
func (s *Store) initialize() error {
	dir := filepath.Dir(s.tasksDir)
	if err := ensureDirectory(dir); err != nil {
		return err
	}
	if err := safeFile(dir, "workspace.json"); err != nil {
		return err
	}
	path := filepath.Join(dir, "workspace.json")
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		s.info = WorkspaceInfo{ID: uuid.NewString(), Name: filepath.Base(s.root)}
		data, _ = json.MarshalIndent(s.info, "", "  ")
		if err := atomicWrite(path, data, 0o644); err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else if err := json.Unmarshal(data, &s.info); err != nil {
		return err
	}
	if _, err := uuid.Parse(s.info.ID); err != nil {
		return fmt.Errorf("invalid workspace identity")
	}
	if err := safeFile(dir, "workflow.json"); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(dir, "workflow.json")); errors.Is(err, os.ErrNotExist) {
		data, _ = json.MarshalIndent(defaultWorkflow(), "", "  ")
		return atomicWrite(filepath.Join(dir, "workflow.json"), data, 0o644)
	} else if err != nil {
		return err
	}
	_, err = s.readWorkflow()
	return err
}
func (s *Store) Info() WorkspaceInfo { return s.info }
func (s *Store) readWorkflow() (Workflow, error) {
	dir := filepath.Dir(s.tasksDir)
	if err := safeFile(dir, "workflow.json"); err != nil {
		return Workflow{}, err
	}
	data, err := os.ReadFile(filepath.Join(dir, "workflow.json"))
	if err != nil {
		return Workflow{}, err
	}
	var result Workflow
	if err := json.Unmarshal(data, &result); err != nil {
		return result, err
	}
	if err := validateWorkflow(result); err != nil {
		return result, err
	}
	result.Revision = revision(data)
	return result, nil
}
func (s *Store) GetWorkflow() (Workflow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readWorkflow()
}
func validateWorkflow(w Workflow) error {
	if len(w.Phases) == 0 || len(w.Phases) > 24 {
		return fmt.Errorf("%w: a workflow needs 1–24 phases", ErrInvalidName)
	}
	ids := map[string]bool{}
	for _, p := range w.Phases {
		if !regexp.MustCompile(`^[a-zA-Z0-9_-]{1,80}$`).MatchString(p.ID) || ids[p.ID] || strings.TrimSpace(p.Name) == "" || (p.Mode != "interactive" && p.Mode != "async") {
			return fmt.Errorf("%w: invalid or duplicate phase", ErrInvalidName)
		}
		ids[p.ID] = true
	}
	return nil
}
func (s *Store) UpdateWorkflow(w Workflow, expected string) (Workflow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old, err := s.readWorkflow()
	if err != nil {
		return w, err
	}
	if expected == "" || old.Revision != expected {
		return w, ErrConflict
	}
	if err := validateWorkflow(w); err != nil {
		return w, err
	}
	data, _ := json.MarshalIndent(w, "", "  ")
	if err := atomicWrite(filepath.Join(filepath.Dir(s.tasksDir), "workflow.json"), data, 0o644); err != nil {
		return w, err
	}
	return s.readWorkflow()
}
func (s *Store) initializePhases(task *Task, w Workflow) error {
	for _, definition := range w.Phases {
		filename := s.availableFilename(*task, definition.ID+".md", "")
		doc := DocumentSummary{ID: uuid.NewString(), Name: definition.Name, Filename: filename}
		if err := atomicWrite(filepath.Join(s.taskDir(task.ID), filename), []byte(definition.DocumentTemplate), 0o644); err != nil {
			return err
		}
		task.Documents = append(task.Documents, doc)
		task.Phases = append(task.Phases, TaskPhase{PhaseID: definition.ID, DocumentID: doc.ID})
	}
	if task.CurrentPhaseID == "" && len(task.Phases) > 0 {
		task.CurrentPhaseID = task.Phases[0].PhaseID
	}
	return nil
}

// syncPhases resolves task.Phases against the live workflow: phases the task
// is missing are created from the current template, phases the workflow no
// longer defines are dropped (their documents remain as supporting material),
// and every kept phase's Definition is refreshed to the current one. It
// reports whether the task's persisted phase list or current phase changed.
func (s *Store) syncPhases(task Task, w Workflow) (Task, bool, error) {
	existing := map[string]TaskPhase{}
	for _, p := range task.Phases {
		existing[p.PhaseID] = p
	}
	original := task.Phases
	resolved := make([]TaskPhase, 0, len(w.Phases))
	for _, definition := range w.Phases {
		if p, ok := existing[definition.ID]; ok {
			p.Definition = definition
			resolved = append(resolved, p)
			continue
		}
		filename := s.availableFilename(task, definition.ID+".md", "")
		doc := DocumentSummary{ID: uuid.NewString(), Name: definition.Name, Filename: filename}
		if err := atomicWrite(filepath.Join(s.taskDir(task.ID), filename), []byte(definition.DocumentTemplate), 0o644); err != nil {
			return task, false, err
		}
		task.Documents = append(task.Documents, doc)
		resolved = append(resolved, TaskPhase{PhaseID: definition.ID, DocumentID: doc.ID, Definition: definition})
	}
	changed := len(original) != len(resolved)
	if !changed {
		for i := range resolved {
			if original[i].PhaseID != resolved[i].PhaseID || original[i].DocumentID != resolved[i].DocumentID {
				changed = true
				break
			}
		}
	}
	task.Phases = resolved
	valid := false
	for _, p := range task.Phases {
		if p.PhaseID == task.CurrentPhaseID {
			valid = true
			break
		}
	}
	if !valid && len(task.Phases) > 0 {
		task.CurrentPhaseID = task.Phases[0].PhaseID
		changed = true
	}
	return task, changed, nil
}
func validateTask(t Task) error {
	if _, err := uuid.Parse(t.ID); err != nil {
		return err
	}
	if t.Status != "open" && t.Status != "focus" && t.Status != "done" && t.Status != "archived" {
		return fmt.Errorf("%w: invalid task status", ErrInvalidName)
	}
	if t.Priority < 0 || t.Priority > 3 || (t.AgentStatus != nil && *t.AgentStatus != "working") {
		return fmt.Errorf("%w: invalid priority or agent activity", ErrInvalidName)
	}
	docs := map[string]bool{}
	for _, d := range t.Documents {
		if _, err := uuid.Parse(d.ID); err != nil {
			return err
		}
		if d.Filename != filepath.Base(d.Filename) || strings.ContainsAny(d.Filename, `/\`) || !strings.HasSuffix(d.Filename, ".md") || docs[d.ID] {
			return fmt.Errorf("invalid document index")
		}
		docs[d.ID] = true
	}
	for _, p := range t.Phases {
		if p.PhaseID == "" || !docs[p.DocumentID] {
			return fmt.Errorf("phase document missing")
		}
	}
	return nil
}
func (s *Store) GetTask(id string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readTask(id)
}
func (s *Store) UpdateTask(id, expected string, update TaskUpdate) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.readTask(id)
	if err != nil {
		return t, err
	}
	if expected == "" || t.Revision != expected {
		return t, ErrConflict
	}
	for _, field := range update.Fields {
		switch field {
		case "name":
			t.Name, err = cleanName(update.Name)
			if err != nil {
				return t, err
			}
		case "status":
			if update.Status == "archived" && t.Status != "archived" {
				t.PreviousStatus = t.Status
			}
			t.Status = update.Status
		case "priority":
			t.Priority = update.Priority
		case "current_phase_id":
			found := false
			for _, phase := range t.Phases {
				if phase.PhaseID == update.CurrentPhaseID {
					found = true
				}
			}
			if !found {
				return t, fmt.Errorf("%w: unknown phase", ErrInvalidName)
			}
			t.CurrentPhaseID = update.CurrentPhaseID
		case "agent_status":
			t.AgentStatus = update.AgentStatus
		default:
			return t, fmt.Errorf("%w: unknown task field", ErrInvalidName)
		}
	}
	t.UpdatedAt = time.Now().UTC()
	if err := s.writeTask(t); err != nil {
		return t, err
	}
	return s.readTask(id)
}
func (s *Store) RestoreTask(id, expected string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.readTask(id)
	if err != nil {
		return t, err
	}
	if expected == "" || expected != t.Revision {
		return t, ErrConflict
	}
	if t.Status != "archived" {
		return t, fmt.Errorf("%w: task is not archived", ErrInvalidName)
	}
	t.Status = t.PreviousStatus
	if t.Status == "" || t.Status == "archived" {
		t.Status = "open"
	}
	t.PreviousStatus = ""
	t.UpdatedAt = time.Now().UTC()
	if err := s.writeTask(t); err != nil {
		return t, err
	}
	return s.readTask(id)
}
func (s *Store) backup(taskID, name string, data []byte) error {
	dir := filepath.Join(s.taskDir(taskID), "history")
	if err := ensureDirectory(dir); err != nil {
		return err
	}
	if err := safeFile(dir, name); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(dir, name)); err == nil {
		return nil
	}
	return atomicWrite(filepath.Join(dir, name), data, 0o644)
}
