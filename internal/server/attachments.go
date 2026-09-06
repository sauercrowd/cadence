package server

import (
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/sauercrowd/worker/internal/workspace"
)

// Attachments and the workspace logo are served outside the Connect API:
// plain binary files referenced from the Markdown documents or the UI.
func NewFilesHandler(store *workspace.Store) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/workspace/logo", func(w http.ResponseWriter, r *http.Request) {
		contentType, data, err := store.WorkspaceLogo()
		if err != nil {
			attachmentError(w, err)
			return
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Cache-Control", "private, max-age=3600")
		_, _ = w.Write(data)
	})
	mux.HandleFunc("POST /api/tasks/{task}/attachments", func(w http.ResponseWriter, r *http.Request) {
		data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 10<<20))
		if err != nil {
			http.Error(w, "attachment too large", http.StatusRequestEntityTooLarge)
			return
		}
		filename, _ := url.QueryUnescape(r.Header.Get("X-Filename"))
		name, err := store.CreateAttachment(r.PathValue("task"), filename, r.Header.Get("Content-Type"), data)
		if err != nil {
			attachmentError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"name":"` + name + `"}`))
	})
	mux.HandleFunc("GET /api/tasks/{task}/attachments/{name}", func(w http.ResponseWriter, r *http.Request) {
		contentType, data, err := store.ReadAttachment(r.PathValue("task"), r.PathValue("name"))
		if err != nil {
			attachmentError(w, err)
			return
		}
		w.Header().Set("Content-Type", contentType)
		if !workspace.InlineAttachment(contentType) {
			w.Header().Set("Content-Disposition", "attachment; filename=\""+r.PathValue("name")+"\"")
		}
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		_, _ = w.Write(data)
	})
	return mux
}

func attachmentError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, workspace.ErrNotFound):
		http.Error(w, "not found", http.StatusNotFound)
	case errors.Is(err, workspace.ErrInvalidFileType):
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
	case errors.Is(err, workspace.ErrFileTooLarge):
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
	case strings.Contains(err.Error(), "invalid workspace filename"),
		strings.Contains(err.Error(), "symlinks are not supported"):
		http.Error(w, "not found", http.StatusNotFound)
	default:
		http.Error(w, "internal workspace error", http.StatusInternalServerError)
	}
}
