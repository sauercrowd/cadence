package workspace

import (
	"fmt"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"path/filepath"
	"time"
)

func (s *Store) CreateSubtask(taskID, phaseID, name, expected string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.readTask(taskID)
	if err != nil {
		return Task{}, err
	}
	if expected == "" || expected != t.Revision {
		return Task{}, ErrConflict
	}
	name, err = cleanName(name)
	if err != nil {
		return Task{}, err
	}
	found := false
	for _, p := range t.Phases {
		if p.PhaseID == phaseID {
			found = true
		}
	}
	if !found {
		return Task{}, fmt.Errorf("%w: unknown phase", ErrInvalidName)
	}
	doc := DocumentSummary{ID: uuid.NewString(), Name: name, Filename: s.availableFilename(t, slug(name)+".md", "")}
	// Stage content first: a failed metadata transaction can leave only an
	// unreferenced Markdown file, never a committed reference to missing content.
	if err := atomicWrite(filepath.Join(s.taskDir(taskID), doc.Filename), []byte("# "+name+"\n\n"), 0o644); err != nil {
		return Task{}, err
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		d := documentRecord{ID: doc.ID, TaskID: t.ID, Name: name, Filename: doc.Filename, Position: len(t.Documents)}
		if err := tx.Create(&d).Error; err != nil {
			return err
		}
		step := subtaskRecord{TaskID: t.ID, PhaseID: phaseID, DocumentID: doc.ID, Name: name}
		if err := tx.Omit(clause.Associations).Create(&step).Error; err != nil {
			return err
		}
		t.Documents = append(t.Documents, doc)
		t.Subtasks = append(t.Subtasks, Subtask{Number: step.Number, PhaseID: phaseID, DocumentID: doc.ID, Name: name})
		t.UpdatedAt = time.Now().UTC()
		result := tx.Model(&taskRecord{}).Where("id = ? AND revision = ? AND deleted = ?", t.ID, expected, false).Updates(map[string]any{"revision": taskRevision(t), "updated_at": t.UpdatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		return nil
	})
	if err != nil {
		return Task{}, err
	}
	return s.readTask(taskID)
}
func (s *Store) UpdateSubtask(taskID string, number int, done bool, expected string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.readTask(taskID)
	if err != nil {
		return Task{}, err
	}
	if expected == "" || expected != t.Revision {
		return Task{}, ErrConflict
	}
	found := false
	for i := range t.Subtasks {
		if t.Subtasks[i].Number == number {
			t.Subtasks[i].Done = done
			found = true
		}
	}
	if !found {
		return Task{}, ErrNotFound
	}
	t.UpdatedAt = time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&taskRecord{}).Where("id = ? AND revision = ? AND deleted = ?", t.ID, expected, false).Updates(map[string]any{"revision": taskRevision(t), "updated_at": t.UpdatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		return tx.Model(&subtaskRecord{}).Where("task_id = ? AND number = ?", t.ID, number).Update("done", done).Error
	})
	if err != nil {
		return Task{}, err
	}
	return s.readTask(taskID)
}
