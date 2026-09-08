package workspace

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Only http(s) links are stored. The UI opens them in a new tab, so schemes
// that execute in the opener's context (javascript:, data:, file:) must never
// reach it.
func cleanURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("%w: link URL is required", ErrInvalidName)
	}
	if len(raw) > 2048 {
		return "", fmt.Errorf("%w: link URL must be 2048 characters or fewer", ErrInvalidName)
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrInvalidName, err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("%w: link URL must be http or https", ErrInvalidName)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("%w: link URL needs a host", ErrInvalidName)
	}
	return parsed.String(), nil
}

func cleanTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if len(title) > 120 {
		return "", fmt.Errorf("%w: link title must be 120 characters or fewer", ErrInvalidName)
	}
	return title, nil
}

// bumpRevision applies the caller's optimistic-concurrency check and rolls the
// task revision forward. Both link writes change only child rows, so the task
// row itself just needs its revision and timestamp refreshed.
func bumpRevision(tx *gorm.DB, t Task, expected string) error {
	result := tx.Model(&taskRecord{}).Where("id = ? AND revision = ? AND deleted = ?", t.ID, expected, false).
		Updates(map[string]any{"revision": taskRevision(t), "updated_at": t.UpdatedAt})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrConflict
	}
	return nil
}

func (s *Store) CreatePhaseLink(taskID, phaseID, rawURL, title, expected string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.readTask(taskID)
	if err != nil {
		return Task{}, err
	}
	if expected == "" || expected != t.Revision {
		return Task{}, ErrConflict
	}
	href, err := cleanURL(rawURL)
	if err != nil {
		return Task{}, err
	}
	if title, err = cleanTitle(title); err != nil {
		return Task{}, err
	}
	found := false
	position := 0
	for _, p := range t.Phases {
		if p.PhaseID == phaseID {
			found = true
		}
	}
	if !found {
		return Task{}, fmt.Errorf("%w: unknown phase", ErrInvalidName)
	}
	for _, l := range t.Links {
		if l.PhaseID == phaseID {
			position++
		}
	}
	err = s.db.Transaction(func(tx *gorm.DB) error {
		r := phaseLinkRecord{TaskID: t.ID, PhaseID: phaseID, URL: href, Title: title, Position: position}
		if err := tx.Omit(clause.Associations).Create(&r).Error; err != nil {
			return err
		}
		t.Links = append(t.Links, PhaseLink{Number: r.Number, PhaseID: phaseID, URL: href, Title: title})
		t.UpdatedAt = time.Now().UTC()
		return bumpRevision(tx, t, expected)
	})
	if err != nil {
		return Task{}, err
	}
	return s.readTask(taskID)
}

func (s *Store) DeletePhaseLink(taskID string, number int, expected string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, err := s.readTask(taskID)
	if err != nil {
		return Task{}, err
	}
	if expected == "" || expected != t.Revision {
		return Task{}, ErrConflict
	}
	remaining := make([]PhaseLink, 0, len(t.Links))
	for _, l := range t.Links {
		if l.Number != number {
			remaining = append(remaining, l)
		}
	}
	if len(remaining) == len(t.Links) {
		return Task{}, ErrNotFound
	}
	t.Links = remaining
	t.UpdatedAt = time.Now().UTC()
	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := bumpRevision(tx, t, expected); err != nil {
			return err
		}
		return tx.Where("task_id = ? AND number = ?", t.ID, number).Delete(&phaseLinkRecord{}).Error
	})
	if err != nil {
		return Task{}, err
	}
	return s.readTask(taskID)
}
