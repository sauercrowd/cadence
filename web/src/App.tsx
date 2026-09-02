import { ConnectError, Code } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import { Check, FileText, LoaderCircle, Plus, RotateCcw, Search, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { workspaceClient } from "./api";
import type { Document as WorkerDocument, Task } from "./gen/worker/v1/worker_pb";
import { EmptySchema } from "@bufbuild/protobuf/wkt";
import { MarkdownEditor, type MarkdownEditorAPI } from "./MarkdownEditor";
import { type CommentThread, parseDocumentFile, serializeDocumentFile } from "./comments";

type SaveState = "saved" | "saving" | "conflict" | "error";
type CommentPopoverState = { id: string; left: number; top: number };

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const [document, setDocument] = useState<WorkerDocument>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [markdown, setMarkdown] = useState("");
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [commentPopover, setCommentPopover] = useState<CommentPopoverState>();
  const editorAPI = useRef<MarkdownEditorAPI | undefined>(undefined);
  const markdownRef = useRef("");
  const commentsRef = useRef<CommentThread[]>([]);
  const revisions = useRef(new Map<string, string>());
  const saveTimers = useRef(new Map<string, number>());
  const saveQueue = useRef(Promise.resolve());

  const selectedTask = tasks.find((task) => task.id === selectedTaskId);

  const refreshTasks = useCallback(async () => {
    const response = await workspaceClient.listTasks(create(EmptySchema));
    setTasks(response.tasks);
    setSelectedTaskId((current) => {
      if (current && response.tasks.some((task) => task.id === current)) return current;
      return response.tasks[0]?.id;
    });
    return response.tasks;
  }, []);

  useEffect(() => {
    void refreshTasks()
      .catch((reason: unknown) => setError(messageFor(reason)))
      .finally(() => setLoading(false));
  }, [refreshTasks]);

  useEffect(() => {
    if (!selectedTask) {
      setSelectedDocumentId(undefined);
      setDocument(undefined);
      return;
    }
    setSelectedDocumentId((current) => {
      if (current && selectedTask.documents.some((item) => item.id === current)) return current;
      return selectedTask.documents[0]?.id;
    });
  }, [selectedTask]);

  const loadDocument = useCallback(async (taskId: string, documentId: string) => {
    setDocument(undefined);
    setSaveState("saved");
    try {
      const loaded = await workspaceClient.getDocument({ taskId, documentId });
      const parsed = parseDocumentFile(loaded.content);
      revisions.current.set(documentId, loaded.revision);
      markdownRef.current = parsed.markdown;
      commentsRef.current = parsed.comments;
      setMarkdown(parsed.markdown);
      setComments(parsed.comments);
      setCommentPopover(undefined);
      setDocument(loaded);
    } catch (reason) {
      setError(messageFor(reason));
    }
  }, []);

  useEffect(() => {
    if (selectedTaskId && selectedDocumentId) {
      void loadDocument(selectedTaskId, selectedDocumentId);
    }
  }, [loadDocument, selectedDocumentId, selectedTaskId]);

  const scheduleSave = useCallback((taskId: string, documentId: string, content: string) => {
    const existing = saveTimers.current.get(documentId);
    if (existing) window.clearTimeout(existing);
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      saveTimers.current.delete(documentId);
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const saved = await workspaceClient.updateDocument({
            taskId,
            documentId,
            content,
            revision: revisions.current.get(documentId) ?? "",
          });
          revisions.current.set(documentId, saved.revision);
          setSaveState("saved");
        } catch (reason) {
          const connectError = ConnectError.from(reason);
          setSaveState(connectError.code === Code.Aborted ? "conflict" : "error");
        }
      });
    }, 650);
    saveTimers.current.set(documentId, timer);
  }, []);

  async function createTask(name: string) {
    const task = await workspaceClient.createTask({ name });
    await refreshTasks();
    setSelectedTaskId(task.id);
    setSelectedDocumentId(undefined);
  }

  async function createDocument(name: string) {
    if (!selectedTaskId) return;
    const created = await workspaceClient.createDocument({ taskId: selectedTaskId, name });
    await refreshTasks();
    setSelectedTaskId(selectedTaskId);
    setSelectedDocumentId(created.id);
  }

  async function reloadDocument() {
    if (selectedTaskId && selectedDocumentId) {
      await loadDocument(selectedTaskId, selectedDocumentId);
    }
  }

  function updateComments(next: CommentThread[]) {
    if (!document) return;
    commentsRef.current = next;
    setComments(next);
    scheduleSave(document.taskId, document.id, serializeDocumentFile(markdownRef.current, next));
  }

  function beginComment() {
    const api = editorAPI.current;
    const quote = api?.selectedText();
    const rect = api?.selectionRect();
    if (!api || !quote || !rect) {
      setError("Select some text first");
      return;
    }
    const thread: CommentThread = {
      id: crypto.randomUUID(),
      body: "",
      quote,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const next = [...commentsRef.current, thread];
    commentsRef.current = next;
    setComments(next);
    api.addComment(thread.id);
    setCommentPopover(popoverPosition(thread.id, rect));
  }

  function discardComment(id: string) {
    editorAPI.current?.removeComment(id);
    updateComments(commentsRef.current.filter((thread) => thread.id !== id));
    setCommentPopover(undefined);
  }

  if (loading) {
    return <div className="center-message"><LoaderCircle className="spin" size={20} /> Opening workspace</div>;
  }

  return (
    <div className="app-shell">
      <aside className="task-rail">
        <div className="brand">worker<span className="brand-dot">.</span></div>
        <div className="rail-label">Tasks</div>
        <nav className="task-list" aria-label="Tasks">
          {tasks.map((task) => (
            <button
              className={`task-item ${task.id === selectedTaskId ? "active" : ""}`}
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
            >
              <span>{task.name}</span>
              <small>{task.documents.length}</small>
            </button>
          ))}
        </nav>
        <CreateRow label="New task" placeholder="Task name" onCreate={createTask} />
      </aside>

      <aside className="document-rail">
        {selectedTask ? (
          <>
            <header className="document-rail-header">
              <div className="eyebrow">Task</div>
              <h1>{selectedTask.name}</h1>
            </header>
            <div className="rail-label document-label">Documents</div>
            <nav className="document-list" aria-label="Documents">
              {selectedTask.documents.map((item) => (
                <button
                  className={`document-item ${item.id === selectedDocumentId ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setSelectedDocumentId(item.id)}
                >
                  <FileText size={15} strokeWidth={1.7} />
                  <span>{item.name}</span>
                </button>
              ))}
            </nav>
            <CreateRow label="New document" placeholder="Document name" onCreate={createDocument} />
          </>
        ) : (
          <div className="rail-empty">Create a task to begin.</div>
        )}
      </aside>

      <main className="workspace">
        {document ? (
          <>
            <header className="workspace-header">
              <div>
                <h2>{document.name}</h2>
                <div className="filename">{document.filename}</div>
              </div>
              <SaveIndicator state={saveState} onReload={reloadDocument} />
            </header>
            <div className="editor-scroll">
              <MarkdownEditor
                documentId={document.id}
                value={markdown}
                comments={comments}
                onReady={(api) => { editorAPI.current = api; }}
                onAddComment={beginComment}
                onCommentClick={(id, rect) => setCommentPopover(popoverPosition(id, rect))}
                onChange={(content) => {
                  markdownRef.current = content;
                  setMarkdown(content);
                  scheduleSave(document.taskId, document.id, serializeDocumentFile(content, commentsRef.current));
                }}
              />
            </div>
          </>
        ) : selectedTask ? (
          <EmptyDocument onCreate={createDocument} />
        ) : (
          <EmptyWorkspace onCreate={createTask} />
        )}
      </main>

      {commentPopover ? (
        <CommentPopover
          comments={comments}
          thread={comments.find((thread) => thread.id === commentPopover.id)}
          position={commentPopover}
          onChange={updateComments}
          onDiscard={discardComment}
          onClose={() => setCommentPopover(undefined)}
        />
      ) : null}

      {error ? <button className="error-toast" onClick={() => setError(undefined)}>{error}</button> : null}
    </div>
  );
}

function CommentPopover({ comments, thread, position, onChange, onDiscard, onClose }: {
  comments: CommentThread[];
  thread?: CommentThread;
  position: CommentPopoverState;
  onChange: (comments: CommentThread[]) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}) {
  if (!thread) return null;
  return (
    <aside className={`comment-popover ${thread.status}`} style={{ left: position.left, top: position.top }}>
      <button className="comment-close" onClick={onClose} aria-label="Close"><X size={14} /></button>
      <div className="comment-quote">“{thread.quote}”</div>
      {thread.body ? <p>{thread.body}</p> : (
        <CommentComposer
          onCancel={() => onDiscard(thread.id)}
          onSubmit={(body) => onChange(commentsWith(thread.id, { body }))}
        />
      )}
      {thread.body ? (
        <div className="comment-footer">
          <span>{thread.status === "open" ? "Open" : "Resolved"}</span>
          <button onClick={() => onChange(commentsWith(thread.id, {
            status: thread.status === "open" ? "resolved" : "open",
          }))}>{thread.status === "open" ? "Resolve" : "Reopen"}</button>
        </div>
      ) : null}
      <span className="comment-popover-arrow" />
    </aside>
  );

  function commentsWith(id: string, change: Partial<CommentThread>) {
    return comments.map((item) => item.id === id ? { ...item, ...change } : item);
  }
}

function CommentComposer({ onSubmit, onCancel }: { onSubmit: (body: string) => void; onCancel: () => void }) {
  const [body, setBody] = useState("");
  return (
    <form className="comment-composer" onSubmit={(event) => {
      event.preventDefault();
      if (body.trim()) onSubmit(body.trim());
    }}>
      <textarea autoFocus value={body} onChange={(event) => setBody(event.target.value)} placeholder="Leave a comment…" />
      <div><button type="button" onClick={onCancel}>Cancel</button><button type="submit" disabled={!body.trim()}>Add</button></div>
    </form>
  );
}

function CreateRow({ label, placeholder, onCreate }: {
  label: string;
  placeholder: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
      setName("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="create-trigger" onClick={() => setOpen(true)}><Plus size={15} />{label}</button>;
  }
  return (
    <form className="create-form" onSubmit={submit}>
      <input autoFocus value={name} placeholder={placeholder} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }} />
      <button type="submit" aria-label="Create" disabled={!name.trim() || busy}><Check size={15} /></button>
    </form>
  );
}

function SaveIndicator({ state, onReload }: { state: SaveState; onReload: () => Promise<void> }) {
  if (state === "saving") return <div className="save-state"><LoaderCircle className="spin" size={14} />Saving</div>;
  if (state === "conflict") {
    return <button className="save-state warning" onClick={() => void onReload()}><RotateCcw size={14} />Changed on disk — reload</button>;
  }
  if (state === "error") return <div className="save-state warning">Couldn’t save</div>;
  return <div className="save-state"><Check size={14} />Saved</div>;
}

function EmptyWorkspace({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Plus size={22} /></div>
      <h2>Create your first task</h2>
      <p>A quiet place for the Markdown that shapes your work.</p>
      <InlineCreate placeholder="Task name" action="Create task" onCreate={onCreate} />
    </div>
  );
}

function EmptyDocument({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><FileText size={21} /></div>
      <h2>Add a document</h2>
      <p>Briefs, plans, notes—use whatever names fit the task.</p>
      <InlineCreate placeholder="Document name" action="Create document" onCreate={onCreate} />
    </div>
  );
}

function InlineCreate({ placeholder, action, onCreate }: {
  placeholder: string;
  action: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  return (
    <form className="inline-create" onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim()) return;
      void onCreate(name.trim()).then(() => setName(""));
    }}>
      <Search size={15} />
      <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={placeholder} />
      <button disabled={!name.trim()}>{action}</button>
    </form>
  );
}

function messageFor(reason: unknown) {
  return ConnectError.from(reason).rawMessage || "Something went wrong";
}

function popoverPosition(id: string, rect: DOMRect): CommentPopoverState {
  const width = 286;
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12));
  const preferredTop = rect.bottom + 12;
  const top = Math.max(12, Math.min(preferredTop, window.innerHeight - 230));
  return { id, left, top };
}
