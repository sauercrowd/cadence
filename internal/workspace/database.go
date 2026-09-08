package workspace

import (
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// ORM records separate persistence from the public model. Deleted records
// reserve their public numbers permanently.
type taskRecord struct {
	Steps          []subtaskRecord `gorm:"foreignKey:TaskID;references:ID"`
	Number         int             `gorm:"primaryKey;autoIncrement"`
	ID             string          `gorm:"not null;uniqueIndex"`
	Name           string          `gorm:"not null"`
	Status         string          `gorm:"not null;check:status IN ('open','focus','done','archived')"`
	Priority       int             `gorm:"not null;check:priority BETWEEN 0 AND 3"`
	AgentStatus    *string         `gorm:"check:agent_status IS NULL OR agent_status = 'working'"`
	CurrentPhaseID string
	CreatedAt      time.Time `gorm:"autoCreateTime:false"`
	UpdatedAt      time.Time `gorm:"autoUpdateTime:false"`
	Revision       string
	Deleted        bool
	Documents      []documentRecord  `gorm:"foreignKey:TaskID;references:ID"`
	Phases         []taskPhaseRecord `gorm:"foreignKey:TaskID;references:ID"`
}

func (taskRecord) TableName() string { return "tasks" }

type documentRecord struct {
	ID       string `gorm:"primaryKey;uniqueIndex:document_owner"`
	TaskID   string `gorm:"not null;uniqueIndex:document_owner;uniqueIndex:document_filename"`
	Name     string
	Filename string `gorm:"not null;uniqueIndex:document_filename,collate:nocase"`
	Position int
}

func (documentRecord) TableName() string { return "documents" }

type taskPhaseRecord struct {
	TaskID     string `gorm:"primaryKey"`
	PhaseID    string `gorm:"primaryKey"`
	DocumentID string `gorm:"not null"`
	Position   int
	Document   documentRecord `gorm:"foreignKey:DocumentID,TaskID;references:ID,TaskID"`
}

func (taskPhaseRecord) TableName() string { return "task_phases" }

type phaseRecord struct {
	Number   int    `gorm:"primaryKey;autoIncrement"`
	ID       string `gorm:"not null;uniqueIndex"`
	Name     string
	Mode     string `gorm:"not null;check:mode IN ('interactive','async')"`
	Template string
	Position int
	Active   bool
}

func (phaseRecord) TableName() string { return "phases" }

type subtaskRecord struct {
	Number     int    `gorm:"primaryKey;autoIncrement"`
	TaskID     string `gorm:"not null;index"`
	PhaseID    string
	DocumentID string `gorm:"not null;uniqueIndex"`
	Name       string
	Done       bool
	Document   documentRecord `gorm:"foreignKey:DocumentID,TaskID;references:ID,TaskID"`
}

func (subtaskRecord) TableName() string { return "subtasks" }

type workflowRecord struct {
	ID       int `gorm:"primaryKey;autoIncrement:false"`
	Revision string
}
type migrationRecord struct {
	Version int `gorm:"primaryKey;autoIncrement:false"`
}
type historyRecord struct {
	Kind     string `gorm:"primaryKey"`
	ID       string `gorm:"primaryKey"`
	Revision string `gorm:"primaryKey"`
	Content  []byte
}

func (s *Store) openDatabase() error {
	dir := filepath.Dir(s.tasksDir)
	for _, name := range []string{"cadence.db", "cadence.db-wal", "cadence.db-shm"} {
		if err := safeFile(dir, name); err != nil {
			return err
		}
	}
	u := url.URL{Scheme: "file", Path: filepath.Join(dir, "cadence.db")}
	db, err := gorm.Open(sqlite.New(sqlite.Config{DriverName: "sqlite", DSN: u.String() + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_txlock=immediate"}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return err
	}
	s.db = db
	pool, err := db.DB()
	if err != nil {
		return err
	}
	pool.SetMaxOpenConns(1)
	if err = db.AutoMigrate(&migrationRecord{}, &taskRecord{}, &documentRecord{}, &taskPhaseRecord{}, &phaseRecord{}, &workflowRecord{}, &historyRecord{}, &subtaskRecord{}); err != nil {
		pool.Close()
		return err
	}
	if err = s.importJSON(); err != nil {
		pool.Close()
		return fmt.Errorf("import workspace metadata: %w", err)
	}
	return nil
}
func (s *Store) Close() error {
	db, err := s.db.DB()
	if err != nil {
		return err
	}
	return db.Close()
}

// Import everything and the marker in one transaction. Originals are untouched.
func (s *Store) importJSON() error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var marker migrationRecord
		err := tx.First(&marker, "version = ?", 1).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		w := defaultWorkflow()
		dir := filepath.Dir(s.tasksDir)
		if err := safeFile(dir, "workflow.json"); err != nil {
			return err
		}
		raw, err := os.ReadFile(filepath.Join(dir, "workflow.json"))
		if err == nil {
			if err = json.Unmarshal(raw, &w); err != nil {
				return err
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		next := 0
		for _, p := range w.Phases {
			if p.Number > next {
				next = p.Number
			}
		}
		for i := range w.Phases {
			if w.Phases[i].Number == 0 {
				next++
				w.Phases[i].Number = next
			}
		}
		if err := validateWorkflow(w); err != nil {
			return err
		}
		for i, p := range w.Phases {
			r := phaseRecord{Number: p.Number, ID: p.ID, Name: p.Name, Mode: p.Mode, Template: p.DocumentTemplate, Position: i, Active: true}
			if err := tx.Create(&r).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(&workflowRecord{ID: 1, Revision: workflowRevision(w)}).Error; err != nil {
			return err
		}
		entries, err := os.ReadDir(s.tasksDir)
		if err != nil {
			return err
		}
		var tasks []Task
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			if err := safeFile(s.tasksDir, entry.Name()); err != nil {
				return err
			}
			if err := safeFile(s.taskDir(entry.Name()), "task.json"); err != nil {
				return err
			}
			raw, err := os.ReadFile(filepath.Join(s.taskDir(entry.Name()), "task.json"))
			if err != nil {
				return fmt.Errorf("%s: %w", entry.Name(), err)
			}
			var t Task
			if err := json.Unmarshal(raw, &t); err != nil {
				return err
			}
			if t.ID != entry.Name() || t.SchemaVersion != 1 {
				return fmt.Errorf("invalid task manifest %s", entry.Name())
			}
			tasks = append(tasks, t)
		}
		sort.Slice(tasks, func(i, j int) bool {
			if tasks[i].CreatedAt.Equal(tasks[j].CreatedAt) {
				return tasks[i].ID < tasks[j].ID
			}
			return tasks[i].CreatedAt.Before(tasks[j].CreatedAt)
		})
		next = 0
		for _, t := range tasks {
			if t.Number > next {
				next = t.Number
			}
		}
		for _, t := range tasks {
			if t.Number == 0 {
				next++
				t.Number = next
			}
			if err := validateTask(t); err != nil {
				return err
			}
			if err := insertTask(tx, &t); err != nil {
				return err
			}
		}
		return tx.Create(&migrationRecord{Version: 1}).Error
	})
}
func workflowRevision(w Workflow) string { raw, _ := json.Marshal(w); return revision(raw) }
func taskRevision(t Task) string         { raw, _ := json.Marshal(t); return revision(raw) }
func recordForTask(t Task) taskRecord {
	return taskRecord{Number: t.Number, ID: t.ID, Name: t.Name, Status: t.Status, Priority: t.Priority, AgentStatus: t.AgentStatus, CurrentPhaseID: t.CurrentPhaseID, CreatedAt: t.CreatedAt, UpdatedAt: t.UpdatedAt, Revision: taskRevision(t)}
}
func insertTask(tx *gorm.DB, t *Task) error {
	r := recordForTask(*t)
	if err := tx.Omit(clause.Associations).Create(&r).Error; err != nil {
		return err
	}
	t.Number = r.Number
	if err := tx.Model(&r).Update("revision", taskRevision(*t)).Error; err != nil {
		return err
	}
	return writeTaskChildren(tx, *t)
}
func writeTaskChildren(tx *gorm.DB, t Task) error {
	if err := tx.Where("task_id = ?", t.ID).Delete(&taskPhaseRecord{}).Error; err != nil {
		return err
	}
	ids := []string{}
	for _, d := range t.Documents {
		ids = append(ids, d.ID)
	}
	obsolete := tx.Where("task_id = ?", t.ID)
	if len(ids) > 0 {
		obsolete = obsolete.Where("id NOT IN ?", ids)
	}
	if err := obsolete.Delete(&documentRecord{}).Error; err != nil {
		return err
	}
	for i, d := range t.Documents {
		r := documentRecord{ID: d.ID, TaskID: t.ID, Name: d.Name, Filename: d.Filename, Position: i}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoUpdates: clause.AssignmentColumns([]string{"name", "filename", "position"})}).Create(&r).Error; err != nil {
			return err
		}
	}
	for i, p := range t.Phases {
		r := taskPhaseRecord{TaskID: t.ID, PhaseID: p.PhaseID, DocumentID: p.DocumentID, Position: i}
		if err := tx.Omit(clause.Associations).Create(&r).Error; err != nil {
			return err
		}
	}
	return nil
}
func (s *Store) loadTask(id string) (Task, error) {
	var r taskRecord
	ordered := func(db *gorm.DB) *gorm.DB { return db.Order("position") }
	err := s.db.Preload("Documents", ordered).Preload("Phases", ordered).Preload("Steps", func(db *gorm.DB) *gorm.DB { return db.Order("number") }).First(&r, "id = ? AND deleted = ?", id, false).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Task{}, ErrNotFound
	}
	if err != nil {
		return Task{}, err
	}
	t := Task{SchemaVersion: 1, Number: r.Number, ID: r.ID, Name: r.Name, Status: r.Status, Priority: r.Priority, AgentStatus: r.AgentStatus, CurrentPhaseID: r.CurrentPhaseID, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt, Revision: r.Revision, Documents: []DocumentSummary{}, Phases: []TaskPhase{}}
	for _, d := range r.Documents {
		t.Documents = append(t.Documents, DocumentSummary{ID: d.ID, Name: d.Name, Filename: d.Filename})
	}
	for _, p := range r.Phases {
		t.Phases = append(t.Phases, TaskPhase{PhaseID: p.PhaseID, DocumentID: p.DocumentID})
	}
	for _, step := range r.Steps {
		t.Subtasks = append(t.Subtasks, Subtask{Number: step.Number, PhaseID: step.PhaseID, DocumentID: step.DocumentID, Name: step.Name, Done: step.Done})
	}
	return t, nil
}
func (s *Store) taskIDs() ([]string, error) {
	ids := []string{}
	err := s.db.Model(&taskRecord{}).Where("deleted = ?", false).Order("number").Pluck("id", &ids).Error
	return ids, err
}
