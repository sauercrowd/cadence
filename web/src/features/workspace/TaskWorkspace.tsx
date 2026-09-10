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
import { KeyHint, useShortcut, useShortcutKey } from "../../app/keys";
import { PhaseHeaderLinks, PhaseLinkPicker } from "./PhaseLinks";

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
  const [dialog, setDialog] = useState<
      "document" | "subphase" | "link" | "links" | "conflict" | null
    >(null),
    [parentPhase, setParentPhase] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
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

  // Phases carry visible numbers, so their numbers select them. [ and ] step
  // through everything in the navigator, phases and supporting documents alike.
  const subphasesOf = (phaseId: string) =>
    task.subphases.filter((s) => s.phaseId === phaseId);
  // A subphase document belongs to its phase in the navigator; only documents
  // owned by neither are listed as supporting documents.
  const owned = new Set([
    ...task.phases.map((p) => p.documentId),
    ...task.phases.flatMap((p) =>
      subphasesOf(p.definition.id).map((s) => s.documentId),
    ),
  ]);
  const supporting = task.documents.filter((d) => !owned.has(d.id));
  const order = [
    ...task.phases.flatMap((p) => [
      p.documentId,
      ...subphasesOf(p.definition.id).map((s) => s.documentId),
    ]),
    ...supporting.map((d) => d.id),
  ];
  const step = (delta: number) => {
    const at = order.indexOf(documentId);
    const next = order[(at + delta + order.length) % order.length];
    if (next) changeDocument(next);
  };
  useShortcutKey("jump-number", (key) => {
    const phase = task.phases.find((p) => p.definition.number === Number(key));
    if (phase) changeDocument(phase.documentId);
  });
  // Links belong to a phase, and a subphase document counts as being on it.
  const activePhaseId =
    phase?.definition.id ??
    task.subphases.find((s) => s.documentId === documentId)?.phaseId ??
    "";
  const links = task.links.filter((l) => l.phaseId === activePhaseId);
  const addPhaseLink = () => {
    setParentPhase(activePhaseId);
    setUrl("");
    setName("");
    setDialog("link");
  };
  const deletePhaseLink = (link: (typeof links)[number]) =>
    void run(async () => {
      await session.flush();
      onTask(await api.deletePhaseLink(await api.task(task.id), link.number));
    });
  useShortcut("phase-links", () => setDialog("links"), links.length > 0);
  useShortcut("doc-next", () => step(1));
  useShortcut("doc-prev", () => step(-1));
  useShortcut("back", onBack);
  useShortcut(
    "make-current",
    () => phase && update({ currentPhaseId: phase.definition.id }),
    !!phase && phase.definition.id !== task.currentPhaseId,
  );
  useShortcut("edit", () =>
    document
      .querySelector<HTMLElement>(".rich-editor, .source-editor .cm-content")
      ?.focus(),
  );

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
                  className={`phase-group ${i < currentPhaseIndex ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
                >
                  <div
                    className={`phase-nav-item ${p.documentId === documentId ? "selected" : ""}`}
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
                        {p.definition.number}
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
                      <span>{p.definition.name}</span>
                      {p.definition.mode === "async" && (
                        <Bot size={13} aria-label="Async phase" />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Add subphase to ${p.definition.name}`}
                      disabled={busy}
                      onClick={() => {
                        setParentPhase(p.definition.id);
                        setName("");
                        setDialog("subphase");
                      }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {subphasesOf(p.definition.id).map((s) => (
                    <div
                      key={s.number}
                      className={`subphase-nav ${s.documentId === documentId ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={s.done}
                        aria-label={`Complete ${s.name}`}
                        disabled={busy}
                        onChange={(event) => {
                          const done = event.target.checked;
                          void run(async () => {
                            await session.flush();
                            onTask(
                              await api.updateSubphase(
                                await api.task(task.id),
                                s.number,
                                done,
                              ),
                            );
                          });
                        }}
                      />
                      <button
                        className={`phase-nav-label ${s.done ? "is-complete" : ""}`}
                        onClick={() => changeDocument(s.documentId)}
                        title={s.name}
                      >
                        <span className="task-code">S{s.number}</span>
                        <span>{s.name}</span>
                      </button>
                    </div>
                  ))}
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
          {supporting.map((d) => (
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
              {phase && (
                <span className="task-code">#{phase.definition.number}</span>
              )}
              <h2>{phase?.definition.name || doc.name}</h2>
              {phase?.definition.mode === "async" && (
                <Bot size={14} aria-label="Async phase" />
              )}
              {activePhaseId && (
                <PhaseHeaderLinks
                  links={links}
                  busy={busy}
                  onAdd={addPhaseLink}
                  onDelete={deletePhaseLink}
                />
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
                taskId={task.id}
                onChange={(content) => session.edit(content)}
                onUploadComplete={(marker, markdown) =>
                  session.completeUpload(marker, markdown)
                }
                onError={onError}
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
      {dialog === "links" && (
        <PhaseLinkPicker links={links} onClose={() => setDialog(null)} />
      )}
      {dialog === "subphase" && (
        <Modal title="Add subphase" onClose={() => setDialog(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await session.flush();
                const updated = await api.createSubphase(
                  await api.task(task.id),
                  parentPhase,
                  name.trim(),
                );
                onTask(updated);
                changeDocument(
                  updated.subphases[updated.subphases.length - 1].documentId,
                );
              });
            }}
          >
            <div className="modal-content">
              <label>
                Subphase name
                <input
                  data-autofocus
                  required
                  maxLength={120}
                  placeholder="Storage layer"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </div>
            <footer>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                Create subphase
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {dialog === "link" && (
        <Modal title="Add link" onClose={() => setDialog(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await session.flush();
                onTask(
                  await api.createPhaseLink(
                    await api.task(task.id),
                    parentPhase,
                    url.trim(),
                    name.trim(),
                  ),
                );
                setDialog(null);
              });
            }}
          >
            <div className="modal-content">
              <label>
                URL
                <input
                  data-autofocus
                  type="url"
                  required
                  maxLength={2048}
                  placeholder="https://github.com/org/repo/pull/1"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>
              <label className="stacked-field">
                Label (optional)
                <input
                  maxLength={120}
                  placeholder="Pull request"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </div>
            <footer>
              <button className="button primary" disabled={busy || !url.trim()}>
                Add link
              </button>
            </footer>
          </form>
        </Modal>
      )}
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
