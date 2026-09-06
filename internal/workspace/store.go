package workspace

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/google/uuid"
)

var (
	ErrNotFound        = errors.New("not found")
	ErrConflict        = errors.New("document changed on disk")
	ErrInvalidName     = errors.New("invalid name")
	ErrInvalidFileType = errors.New("unsupported file type")
	ErrFileTooLarge    = errors.New("file too large")
)

type DocumentSummary struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Filename string `json:"filename"`
}

type Task struct {
	SchemaVersion  int               `json:"schemaVersion"`
	ID             string            `json:"id"`
	Name           string            `json:"name"`
	Documents      []DocumentSummary `json:"documents"`
	CreatedAt      time.Time         `json:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt"`
	Status         string            `json:"status"`
	Priority       int               `json:"priority"`
	AgentStatus    *string           `json:"agentStatus"`
	CurrentPhaseID string            `json:"currentPhaseId"`
	Phases         []TaskPhase       `json:"phases"`
	Revision       string            `json:"-"`
}

type Document struct {
	DocumentSummary
	TaskID   string
	Content  string
	Revision string
}

type Store struct {
	root     string
	tasksDir string
	trashDir string
	mu       sync.Mutex
	info     WorkspaceInfo
}

func NewStore(projectRoot string) (*Store, error) {
	root, err := filepath.Abs(projectRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve project directory: %w", err)
	}

	workerDir := filepath.Join(root, ".cadence")
	store := &Store{
		root:     root,
		tasksDir: filepath.Join(workerDir, "tasks"),
		trashDir: filepath.Join(workerDir, "trash"),
	}
	for _, dir := range []string{workerDir, store.tasksDir, store.trashDir} {
		if err := ensureDirectory(dir); err != nil {
			return nil, fmt.Errorf("create workspace directory: %w", err)
		}
	}
	if err := store.initialize(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) Root() string { return s.root }

func (s *Store) ListTasks() ([]Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.tasksDir)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}

	tasks := make([]Task, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		task, err := s.readTask(entry.Name())
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].UpdatedAt.After(tasks[j].UpdatedAt)
	})
	return tasks, nil
}

func (s *Store) ListTasksWithErrors() ([]Task, []string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entries, err := os.ReadDir(s.tasksDir)
	if err != nil {
		return nil, nil, err
	}
	tasks := []Task{}
	warnings := []string{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		task, err := s.readTask(entry.Name())
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s: %s", entry.Name(), err))
			continue
		}
		tasks = append(tasks, task)
	}
	return tasks, warnings, nil
}

func (s *Store) CreateTask(name string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name, err := cleanName(name)
	if err != nil {
		return Task{}, err
	}
	now := time.Now().UTC()
	task := Task{
		SchemaVersion: 1, Status: "open", Priority: 2,
		ID:        uuid.NewString(),
		Name:      name,
		Documents: []DocumentSummary{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := os.Mkdir(s.taskDir(task.ID), 0o755); err != nil {
		return Task{}, fmt.Errorf("create task directory: %w", err)
	}
	workflow, err := s.readWorkflow()
	if err != nil {
		return Task{}, err
	}
	if err := s.initializePhases(&task, workflow); err != nil {
		return Task{}, err
	}
	if err := s.writeTask(task); err != nil {
		return Task{}, err
	}
	return s.readTask(task.ID)
}

func (s *Store) RenameTask(id, name string) (Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, err := s.readTask(id)
	if err != nil {
		return Task{}, err
	}
	task.Name, err = cleanName(name)
	if err != nil {
		return Task{}, err
	}
	task.UpdatedAt = time.Now().UTC()
	return task, s.writeTask(task)
}

func (s *Store) DeleteTask(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.readTask(id); err != nil {
		return err
	}
	target := filepath.Join(s.trashDir, fmt.Sprintf("task-%s-%d", id, time.Now().UnixNano()))
	if err := os.Rename(s.taskDir(id), target); err != nil {
		return fmt.Errorf("move task to trash: %w", err)
	}
	return nil
}

func (s *Store) CreateDocument(taskID, name string) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, err := s.readTask(taskID)
	if err != nil {
		return Document{}, err
	}
	name, err = cleanName(name)
	if err != nil {
		return Document{}, err
	}
	filename := s.availableFilename(task, slug(name)+".md", "")
	summary := DocumentSummary{ID: uuid.NewString(), Name: name, Filename: filename}
	path := filepath.Join(s.taskDir(taskID), filename)
	if err := atomicWrite(path, []byte("# "+name+"\n\n"), 0o644); err != nil {
		return Document{}, fmt.Errorf("create document: %w", err)
	}
	task.Documents = append(task.Documents, summary)
	task.UpdatedAt = time.Now().UTC()
	if err := s.writeTask(task); err != nil {
		return Document{}, err
	}
	return s.readDocument(task, summary)
}

func (s *Store) GetDocument(taskID, documentID string) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, summary, err := s.findDocument(taskID, documentID)
	if err != nil {
		return Document{}, err
	}
	return s.readDocument(task, summary)
}

func (s *Store) RenameDocument(taskID, documentID, name string) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, summary, err := s.findDocument(taskID, documentID)
	if err != nil {
		return Document{}, err
	}
	name, err = cleanName(name)
	if err != nil {
		return Document{}, err
	}
	filename := s.availableFilename(task, slug(name)+".md", documentID)
	if filename != summary.Filename {
		oldPath := filepath.Join(s.taskDir(taskID), summary.Filename)
		newPath := filepath.Join(s.taskDir(taskID), filename)
		if err := os.Rename(oldPath, newPath); err != nil {
			return Document{}, fmt.Errorf("rename document: %w", err)
		}
	}
	for i := range task.Documents {
		if task.Documents[i].ID == documentID {
			task.Documents[i].Name = name
			task.Documents[i].Filename = filename
			summary = task.Documents[i]
			break
		}
	}
	task.UpdatedAt = time.Now().UTC()
	if err := s.writeTask(task); err != nil {
		return Document{}, err
	}
	return s.readDocument(task, summary)
}

func (s *Store) UpdateDocument(taskID, documentID, content, expectedRevision string) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, summary, err := s.findDocument(taskID, documentID)
	if err != nil {
		return Document{}, err
	}
	current, err := s.readDocument(task, summary)
	if err != nil {
		return Document{}, err
	}
	if expectedRevision == "" || current.Revision != expectedRevision {
		return Document{}, ErrConflict
	}
	if err := s.backup(task.ID, summary.ID+"-"+current.Revision+".md", []byte(current.Content)); err != nil {
		return Document{}, err
	}
	if err := atomicWrite(filepath.Join(s.taskDir(taskID), summary.Filename), []byte(content), 0o644); err != nil {
		return Document{}, fmt.Errorf("save document: %w", err)
	}
	task.UpdatedAt = time.Now().UTC()
	if err := s.writeTask(task); err != nil {
		return Document{}, err
	}
	return s.readDocument(task, summary)
}

func (s *Store) DeleteDocument(taskID, documentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	task, summary, err := s.findDocument(taskID, documentID)
	if err != nil {
		return err
	}
	for _, phase := range task.Phases {
		if phase.DocumentID == documentID {
			return fmt.Errorf("%w: phase documents cannot be deleted", ErrInvalidName)
		}
	}
	source := filepath.Join(s.taskDir(taskID), summary.Filename)
	target := filepath.Join(s.trashDir, fmt.Sprintf("document-%s-%s-%d.md", taskID, documentID, time.Now().UnixNano()))
	if err := os.Rename(source, target); err != nil {
		return fmt.Errorf("move document to trash: %w", err)
	}
	documents := task.Documents[:0]
	for _, document := range task.Documents {
		if document.ID != documentID {
			documents = append(documents, document)
		}
	}
	task.Documents = documents
	task.UpdatedAt = time.Now().UTC()
	return s.writeTask(task)
}

// Attachments are files dropped into a task's documents. Images and videos
// get inline previews; everything else is served as a download. They live
// in an assets directory beside the Markdown files so the documents stay
// portable plain text that reference them relatively.
var attachmentTypes = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/gif":  ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
	"video/mp4":  ".mp4",
	"video/webm": ".webm",
	"video/ogg":  ".ogv",
}

var safeExtension = regexp.MustCompile(`^[a-z0-9]{1,10}$`)

const maxAttachmentSize = 10 << 20

func (s *Store) CreateAttachment(taskID, filename, contentType string, data []byte) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.readTask(taskID); err != nil {
		return "", err
	}
	if len(data) == 0 || len(data) > maxAttachmentSize {
		return "", ErrFileTooLarge
	}
	if err := ensureDirectory(s.assetsDir(taskID)); err != nil {
		return "", err
	}
	name := uuid.NewString() + attachmentExtension(filename, contentType)
	if err := atomicWrite(filepath.Join(s.assetsDir(taskID), name), data, 0o644); err != nil {
		return "", fmt.Errorf("save attachment: %w", err)
	}
	return name, nil
}

// The stored name keeps the original extension when it is plainly one, so
// downloads open in the right application. Otherwise the upload's content
// type picks one, and extensionless files are served as generic downloads.
func attachmentExtension(filename, contentType string) string {
	base := filepath.Base(filepath.ToSlash(filename))
	if ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(base), ".")); safeExtension.MatchString(ext) {
		return "." + ext
	}
	if ext, ok := attachmentTypes[contentType]; ok {
		return ext
	}
	return ""
}

func attachmentContentType(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	for known, candidate := range attachmentTypes {
		if candidate == ext {
			return known
		}
	}
	if contentType := mime.TypeByExtension(ext); contentType != "" {
		contentType, _, _ = strings.Cut(contentType, ";")
		return contentType
	}
	return "application/octet-stream"
}

// ReadAttachment resolves an attachment by name, refusing anything that
// escapes the task's assets directory.
func (s *Store) ReadAttachment(taskID, name string) (string, []byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.readTask(taskID); err != nil {
		return "", nil, err
	}
	if err := safeFile(s.assetsDir(taskID), name); err != nil {
		return "", nil, err
	}
	data, err := os.ReadFile(filepath.Join(s.assetsDir(taskID), name))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil, ErrNotFound
	}
	if err != nil {
		return "", nil, fmt.Errorf("read attachment: %w", err)
	}
	return attachmentContentType(name), data, nil
}

// InlineAttachments are previewed in the document; anything else is served
// as a download so a dropped HTML file can never render as the app itself.
func InlineAttachment(contentType string) bool {
	return strings.HasPrefix(contentType, "image/") ||
		strings.HasPrefix(contentType, "video/")
}

func (s *Store) findDocument(taskID, documentID string) (Task, DocumentSummary, error) {
	task, err := s.readTask(taskID)
	if err != nil {
		return Task{}, DocumentSummary{}, err
	}
	for _, document := range task.Documents {
		if document.ID == documentID {
			return task, document, nil
		}
	}
	return Task{}, DocumentSummary{}, ErrNotFound
}

func (s *Store) readDocument(task Task, summary DocumentSummary) (Document, error) {
	if err := safeFile(s.taskDir(task.ID), summary.Filename); err != nil {
		return Document{}, err
	}
	content, err := os.ReadFile(filepath.Join(s.taskDir(task.ID), summary.Filename))
	if errors.Is(err, os.ErrNotExist) {
		return Document{}, ErrNotFound
	}
	if err != nil {
		return Document{}, fmt.Errorf("read document: %w", err)
	}
	return Document{
		DocumentSummary: summary,
		TaskID:          task.ID,
		Content:         string(content),
		Revision:        revision(content),
	}, nil
}

func (s *Store) readTask(id string) (Task, error) {
	if _, err := uuid.Parse(id); err != nil {
		return Task{}, ErrNotFound
	}
	if err := safeFile(s.tasksDir, id); err != nil {
		return Task{}, err
	}
	if err := safeFile(s.taskDir(id), "task.json"); err != nil {
		return Task{}, err
	}
	data, err := os.ReadFile(filepath.Join(s.taskDir(id), "task.json"))
	if errors.Is(err, os.ErrNotExist) {
		return Task{}, ErrNotFound
	}
	if err != nil {
		return Task{}, fmt.Errorf("read task: %w", err)
	}
	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		return Task{}, fmt.Errorf("decode task %s: %w", id, err)
	}
	if task.ID != id {
		return Task{}, fmt.Errorf("task directory and manifest IDs do not match")
	}
	if task.SchemaVersion != 1 {
		return Task{}, fmt.Errorf("unsupported task schema for %s", id)
	}
	if err := validateTask(task); err != nil {
		return Task{}, err
	}
	task.Revision = revision(data)
	workflow, err := s.readWorkflow()
	if err != nil {
		return Task{}, err
	}
	synced, changed, err := s.syncPhases(task, workflow)
	if err != nil {
		return Task{}, err
	}
	if !changed {
		return synced, nil
	}
	synced.UpdatedAt = time.Now().UTC()
	if err := s.writeTask(synced); err != nil {
		return Task{}, err
	}
	data, err = os.ReadFile(filepath.Join(s.taskDir(id), "task.json"))
	if err != nil {
		return Task{}, fmt.Errorf("read task: %w", err)
	}
	synced.Revision = revision(data)
	return synced, nil
}

func (s *Store) writeTask(task Task) error {
	if err := validateTask(task); err != nil {
		return err
	}
	path := filepath.Join(s.taskDir(task.ID), "task.json")
	if err := safeFile(s.taskDir(task.ID), "task.json"); err != nil {
		return err
	}
	if old, err := os.ReadFile(path); err == nil {
		if task.Revision != "" && revision(old) != task.Revision {
			return ErrConflict
		}
		if err := s.backup(task.ID, "task-"+revision(old)+".json", old); err != nil {
			return err
		}
	}
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return fmt.Errorf("encode task: %w", err)
	}
	data = append(data, '\n')
	if err := atomicWrite(filepath.Join(s.taskDir(task.ID), "task.json"), data, 0o644); err != nil {
		return fmt.Errorf("write task: %w", err)
	}
	return nil
}

func (s *Store) taskDir(id string) string { return filepath.Join(s.tasksDir, id) }

func (s *Store) assetsDir(taskID string) string {
	return filepath.Join(s.taskDir(taskID), "assets")
}

func (s *Store) availableFilename(task Task, wanted, exceptID string) string {
	used := make(map[string]bool, len(task.Documents))
	for _, document := range task.Documents {
		if document.ID != exceptID {
			used[strings.ToLower(document.Filename)] = true
		}
	}
	_, exists := os.Stat(filepath.Join(s.taskDir(task.ID), wanted))
	if !used[strings.ToLower(wanted)] && errors.Is(exists, os.ErrNotExist) {
		return wanted
	}
	extension := filepath.Ext(wanted)
	base := strings.TrimSuffix(wanted, extension)
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s-%d%s", base, i, extension)
		_, exists := os.Stat(filepath.Join(s.taskDir(task.ID), candidate))
		if !used[strings.ToLower(candidate)] && errors.Is(exists, os.ErrNotExist) {
			return candidate
		}
	}
}

func cleanName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("%w: name is required", ErrInvalidName)
	}
	if len(name) > 120 {
		return "", fmt.Errorf("%w: name must be 120 characters or fewer", ErrInvalidName)
	}
	return name, nil
}

func slug(value string) string {
	var result strings.Builder
	dash := false
	for _, r := range strings.ToLower(value) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			result.WriteRune(r)
			dash = false
			continue
		}
		if result.Len() > 0 && !dash {
			result.WriteByte('-')
			dash = true
		}
	}
	value = strings.Trim(result.String(), "-")
	if value == "" {
		return "document"
	}
	return value
}

func revision(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func atomicWrite(path string, content []byte, mode os.FileMode) error {
	dir := filepath.Dir(path)
	temporary, err := os.CreateTemp(dir, ".cadence-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(mode); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(temporaryPath, path)
}
