import { TaskHeading } from "../tasks/TaskHeading";
import { useEffect, useState, useSyncExternalStore, useRef } from "react";
import {
  ArrowUpRight,
  Check,
  Circle,
  Clock,
  FileText,
  LoaderCircle,
  Bot,
  Plus,
  RefreshCw,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { api, type Task, type Status } from "../../data/api";
import { documentSession } from "../../documents/session";
import { parseFile } from "../../documents/codec";
import { DocumentEditor } from "../editor/DocumentEditor";
import { statusLabels, StatusIcon } from "../tasks/TaskOverview";
import { Modal } from "../../ui/Modal";
import { navigate } from "../../app/router";

export function TaskWorkspace({
  task,
  documentId,
  workspaceId,
  onTask,
  onError,
  onBack,
}: {
  task: Task;
  documentId: string;
  workspaceId: string;
  onTask: (task: Task) => void;
  onError: (error: unknown) => void;
  onBack: () => void;
}) {
  const session = documentSession(workspaceId, task.id, documentId),
    state = useSyncExternalStore(session.subscribe, session.snapshot);
  const phase = task.phases.find((p) => p.documentId === documentId),
    doc = task.documents.find((d) => d.id === documentId);
  const [dialog, setDialog] = useState<"document" | "conflict" | null>(null),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [resolution, setResolution] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void session.load();
    const timer = setInterval(() => void session.refresh(), 5000);
    const refresh = () => void session.refresh();
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      void session.flush();
    };
  }, [session]);
  useEffect(() => {
    if (state.status === "saved")
      void api.task(task.id).then(onTask).catch(onError);
  }, [session, state.status, state.revision]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = session.scrollTop;
  }, [session]);
  const changeDocument = (id: string) => {
    navigate(`/tasks/${task.id}/documents/${id}`);
    setDialog(null);
  };
  const currentPhaseIndex = task.phases.findIndex(
    (p) => p.definition.id === task.currentPhaseId,
  );
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Parameters<typeof api.updateTask>[1]) =>
    void run(async () => {
      await session.flush();
      onTask(await api.updateTask(await api.task(task.id), patch));
    });
  if (!doc)
    return (
      <div className="empty-state">
        <h2>Document not found</h2>
        <button className="button" onClick={onBack}>
          Back to tasks
        </button>
      </div>
    );
  return (
    <div className="task-workspace">
      <div className="task-heading">
        <TaskHeading
          key={task.id}
          task={task}
          busy={busy}
          onUpdate={update}
          onBack={onBack}
        />
      </div>
      <div className="task-body">
        <aside className="phase-navigation">
          <div className="section-label">PHASES</div>
          <div className="phase-timeline">
            {task.phases.map((p, i) => {
              const isCurrent = i === currentPhaseIndex;
              return (
                <div
                  key={p.definition.id}
                  className={`phase-nav-item ${p.documentId === documentId ? "selected" : ""} ${i < currentPhaseIndex ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
                >
                  <button
                    className="phase-step"
                    disabled={busy || isCurrent}
                    title={isCurrent ? "Current phase" : "Make current phase"}
                    aria-label={
                      isCurrent
                        ? `${p.definition.name}: current phase`
                        : `Make ${p.definition.name} the current phase`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      update({ currentPhaseId: p.definition.id });
                    }}
                  >
                    <span className="phase-step-number">
                      {i < currentPhaseIndex ? <Check size={11} /> : i + 1}
                    </span>
                    <span className="phase-step-hover">
                      <Clock size={10} />
                    </span>
                  </button>
                  <button
                    className="phase-nav-label"
                    aria-current={isCurrent ? "step" : undefined}
                    title={p.definition.name}
                    disabled={busy}
                    onClick={() => changeDocument(p.documentId)}
                  >
                    {p.definition.name}
                    {p.definition.mode === "async" && (
                      <Bot size={13} aria-label="Async phase" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="section-label documents-label">
            DOCUMENTS
            <button
              className="icon-button"
              aria-label="Add document"
              onClick={() => {
                setName("");
                setDialog("document");
              }}
            >
              <Plus size={13} />
            </button>
          </div>
          {task.documents
            .filter((d) => !task.phases.some((p) => p.documentId === d.id))
            .map((d) => (
              <button
                key={d.id}
                className={`document-nav-item ${d.id === documentId ? "selected" : ""}`}
                onClick={() => changeDocument(d.id)}
              >
                <FileText size={14} />
                {d.name}
              </button>
            ))}
          <button
            className="document-nav-item muted"
            onClick={() => {
              setName("");
              setDialog("document");
            }}
          >
            <Plus size={14} />
            Add document
          </button>
        </aside>
        <section className="phase-workspace">
          <header className="phase-header">
            <div>
              <h2>{doc.name}</h2>
              {phase?.definition.mode === "async" && (
                <Bot size={14} aria-label="Async phase" />
              )}
            </div>
            <div className="phase-actions">
              <span className={`save-status ${state.status}`}>
                {state.status === "saved" ? (
                  <>
                    <Check size={12} />
                    Saved
                  </>
                ) : state.status === "saving" ? (
                  "Saving…"
                ) : state.status === "unsaved" ? (
                  "Unsaved"
                ) : state.status === "conflict" ? (
                  "Conflict"
                ) : state.status === "error" ? (
                  "Save failed"
                ) : (
                  "Loading…"
                )}
              </span>
              <button
                className="icon-button"
                aria-label="Refresh document"
                onClick={() => void session.refresh()}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </header>
          <select
            className="mobile-document-select"
            aria-label="Select document"
            value={documentId}
            onChange={(e) => changeDocument(e.target.value)}
          >
            {task.documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {(state.error || state.recoveryError) && (
            <div className="notice error">
              {state.error || `Browser draft recovery: ${state.recoveryError}`}
              <button
                className="text-button"
                onClick={() => void session.flush()}
              >
                Retry save
              </button>
            </div>
          )}
          {state.status === "conflict" && (
            <div className="notice error">
              This file changed outside Cadence. Your draft is preserved.
              <button
                className="text-button"
                onClick={() => {
                  setResolution(state.content);
                  setDialog("conflict");
                }}
              >
                Resolve changes
              </button>
            </div>
          )}
          <div
            className="document-scroll"
            ref={scroll}
            onScroll={(e) => {
              session.scrollTop = e.currentTarget.scrollTop;
            }}
          >
            {state.status === "loading" ? (
              <div className="loading-state">
                <LoaderCircle className="working-spin" size={18} />
                Opening document…
              </div>
            ) : state.revision ? (
              <DocumentEditor
                cacheKey={session.key}
                key={`${session.key}/${state.generation}`}
                content={state.content}
                showInstructions={!!phase}
                onChange={(content) => session.edit(content)}
              />
            ) : (
              <div className="empty-state">
                <p>Could not load this document.</p>
                <button className="button" onClick={() => void session.load()}>
                  Retry
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      {dialog === "document" && (
        <Modal title="Add document" onClose={() => setDialog(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const doc = await api.createDocument(task.id, name);
                onTask(await api.task(task.id));
                changeDocument(doc.id);
              });
            }}
          >
            <div className="modal-content">
              <label>
                Document name
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Research notes"
                  required
                  maxLength={120}
                />
              </label>
            </div>
            <footer>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                Create document
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {dialog === "conflict" && (
        <Modal
          title="Resolve document changes"
          onClose={() => setDialog(null)}
          wide
        >
          <div className="modal-content">
            <p className="muted">
              Compare versions and edit the result below. Nothing is overwritten
              until you save the resolution.
            </p>
            <details>
              <summary>Original version</summary>
              <pre className="snapshot-preview">{state.baseContent}</pre>
            </details>
            <details open>
              <summary>Current file on disk</summary>
              <pre className="snapshot-preview">
                {state.diskContent ?? "Reloading disk version…"}
              </pre>
            </details>
            <label>
              Your draft / merged result
              <textarea
                className="monospace conflict-editor"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </label>
          </div>
          <footer>
            <button
              className="button"
              disabled={!state.diskRevision}
              onClick={() => {
                session.resolve(state.diskContent!);
                setDialog(null);
              }}
            >
              Use disk version
            </button>
            <button
              className="button primary"
              disabled={!state.diskRevision}
              onClick={() => {
                session.resolve(resolution);
                setDialog(null);
              }}
            >
              Save resolved version
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
