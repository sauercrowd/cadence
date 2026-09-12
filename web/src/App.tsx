import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  CircleDot,
  Command,
  Folder,
  Layers2,
  LoaderCircle,
  Bot,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { api, type Task, type Status } from "./data/api";
import { useRoute, navigate } from "./app/router";
import { TaskOverview, statusLabels, StatusIcon } from "./features/tasks/TaskOverview";
import { TaskWorkspace } from "./features/workspace/TaskWorkspace";
import { WorkflowSettings } from "./features/workflows/WorkflowSettings";
import { Modal } from "./ui/Modal";
import { KeyHint, useHintMode, useShortcut } from "./app/keys";
import { ShortcutSheet } from "./features/shortcuts/ShortcutSheet";
import { PropertyPopup, flattenFields } from "./ui/PropertyMenu";
import { priorityField, statusField } from "./features/tasks/propertyFields";

const newTaskOptions = flattenFields([priorityField, statusField]);
import { TaskSwitcher } from "./features/tasks/TaskSwitcher";
import { hasUnsavedDocuments } from "./documents/session";
export default function App() {
  const route = useRoute();
  const [workspace, setWorkspace] =
    useState<{ id: string; name: string; logoPath: string }>(),
    [logoBroken, setLogoBroken] = useState(false),
    [tasks, setTasks] = useState<Task[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [creating, setCreating] = useState(false),
    [switching, setSwitching] = useState(false),
    [name, setName] = useState(""),
    [priority, setPriority] = useState(2),
    [status, setStatus] = useState<Status>("open"),
    [propertyOpen, setPropertyOpen] = useState(false),
    [sheet, setSheet] = useState(false),
    [busy, setBusy] = useState(false);
  const latestFetch = useRef(0),
    lastOverview = useRef("/tasks");
  const onError = useCallback(
    (reason: unknown) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    [],
  );
  const refresh = useCallback(async () => {
    const id = ++latestFetch.current;
    try {
      const result = await api.tasks();
      if (id === latestFetch.current) {
        setTasks(result.tasks);
        setWarnings(result.errors);
      }
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void api
      .workspace()
      .then((info) => {
        setLogoBroken(false);
        setWorkspace(info);
      })
      .catch(onError);
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
  useEffect(() => {
    if (route.pathname === "/") navigate("/tasks");
    if (route.pathname === "/focus") navigate("/tasks?status=focus");
    if (route.pathname === "/archived") navigate("/tasks?status=archived");
    if (["/focus", "/tasks", "/archived"].includes(route.pathname))
      lastOverview.current = route.pathname + route.search;
  }, [route]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedDocuments()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  useHintMode();
  useShortcut("go-to-task", () => setSwitching(true));
  useShortcut("tasks", () => navigate(lastOverview.current));
  useShortcut("phases", () => navigate("/settings/workflow"));
  useShortcut("shortcuts", () => setSheet(true));
  useShortcut("new-task", () => create());
  useShortcut("filter", () =>
    document
      .querySelector<HTMLInputElement>('[aria-label="Filter tasks"]')
      ?.focus(),
  );
  const onTask = useCallback(
    (task: Task) =>
      setTasks((current) =>
        current.some((t) => t.id === task.id)
          ? current.map((t) => (t.id === task.id ? task : t))
          : [...current, task],
      ),
    [],
  );
  const match = /^\/tasks\/([^/]+)\/documents\/([^/]+)$/.exec(route.pathname),
    task = match ? tasks.find((t) => t.id === match[1]) : undefined;
  const openTask = (task: Task) => {
    const phase = task.phases.find(
      (p) => p.definition.id === task.currentPhaseId,
    );
    const docId = phase?.documentId || task.documents[0]?.id;
    if (docId) navigate(`/tasks/${task.id}/documents/${docId}`);
  };
  const create = () => {
    setName("");
    setPriority(2);
    setStatus("open");
    setCreating(true);
  };
  return (
    <div className="app-shell" onKeyDownCapture={(event) => {
      if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
      const target = event.target as HTMLElement;
      // Popups own their first Escape; the next one leaves their input.
      if (target.closest(".property-menu")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement &&
          (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName))) {
        event.preventDefault();
        event.stopPropagation();
        active.blur();
      }
    }}>
      <aside className="app-sidebar">
        <div className="workspace-label" title={workspace?.name}>
          {workspace?.logoPath && !logoBroken ? (
            <img
              className="workspace-logo"
              src="/api/workspace/logo"
              alt=""
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <span className="workspace-avatar">
              {workspace?.name.slice(0, 1).toUpperCase() || "C"}
            </span>
          )}
          <span>{workspace?.name || "Workspace"}</span>
        </div>
        <button className="sidebar-new" onClick={create}>
          <Plus size={14} />
          New task
          <KeyHint id="new-task" />
        </button>
        <nav aria-label="Main navigation">
          <button
            className={route.pathname === "/tasks" ? "active" : ""}
            onClick={() => navigate(lastOverview.current)}
            aria-label="Tasks"
          >
            <Layers2 size={16} />
            Tasks
            <KeyHint id="tasks" />
          </button>
          <button
            className={route.pathname === "/settings/workflow" ? "active" : ""}
            onClick={() => navigate("/settings/workflow")}
          >
            <Settings2 size={15} />
            Phases
            <KeyHint id="phases" />
          </button>
        </nav>
        <div className="sidebar-label settings-label">FOCUS</div>
        <nav aria-label="Focused tasks" className="focused-tasks">
          {tasks
            .filter((t) => t.status === "focus")
            .sort(
              (a, b) =>
                a.priority - b.priority || a.title.localeCompare(b.title),
            )
            .map((t) => (
              <button
                key={t.id}
                title={t.title}
                aria-label={t.title}
                aria-current={task?.id === t.id ? "page" : undefined}
                className={task?.id === t.id ? "active" : ""}
                onClick={() => openTask(t)}
              >
                {t.agentStatus === "working" ? (
                  <Bot size={15} aria-label="Agent working" />
                ) : (
                  <CircleDot size={15} />
                )}
                <span className="focused-task-title">{t.title}</span>
                <span className="task-code">#{t.number}</span>
              </button>
            ))}
          {!tasks.some((t) => t.status === "focus") && (
            <p className="focus-empty">Tasks in Focus appear here.</p>
          )}
        </nav>
        <button
          className="sidebar-keys"
          title="Hold Alt to show shortcut keys"
          onClick={() => setSheet(true)}
        >
          <kbd>?</kbd>
          Shortcuts
        </button>
      </aside>
      <main className="app-main">
        {error && (
          <div className="global-error" role="alert">
            <span>{error}</span>
            <button className="text-button" onClick={() => void refresh()}>
              Refresh
            </button>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {warnings.map((warning) => (
          <div className="notice error" key={warning}>
            {warning}
          </div>
        ))}
        {loading ? (
          <div className="loading-state">
            <LoaderCircle className="working-spin" size={20} />
            Opening workspace…
          </div>
        ) : match && task && workspace ? (
          <TaskWorkspace
            task={task}
            documentId={match[2]}
            workspaceId={workspace.id}
            onTask={onTask}
            onError={onError}
            onBack={() => navigate(lastOverview.current)}
          />
        ) : match ? (
          <div className="empty-state">
            <h2>Task unavailable</h2>
            <button className="button" onClick={() => navigate("/tasks")}>
              All tasks
            </button>
          </div>
        ) : route.pathname === "/settings/workflow" ? (
          <WorkflowSettings onError={onError} />
        ) : (
          <TaskOverview
            tasks={tasks}
            route={route}
            onOpen={openTask}
            onCreate={create}
          />
        )}
      </main>
      {sheet && <ShortcutSheet onClose={() => setSheet(false)} />}
      {switching && (
        <TaskSwitcher
          tasks={tasks}
          onOpen={openTask}
          onClose={() => setSwitching(false)}
        />
      )}
      {creating && (
        <Modal title="New task" onClose={() => setCreating(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void api
                .createTask(name.trim(), { priority, status })
                .then((task) => {
                  onTask(task);
                  setCreating(false);
                  openTask(task);
                })
                .catch(onError)
                .finally(() => setBusy(false));
            }}
          >
            <div className="modal-content">
              <div className="property-anchor">
                <label>
                  What would you like to achieve?
                  <input
                    autoFocus
                    data-autofocus
                    placeholder="A clear, concise task title"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "/" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        setPropertyOpen(true);
                      }
                    }}
                  />
                </label>
                <div className="new-task-hint">
                  <StatusIcon status={status} size={14} />
                  {statusLabels[status]}
                  <span>·</span>P{priority}
                  <span className="muted">Press / to change</span>
                </div>
                {propertyOpen && (
                  <PropertyPopup
                    id="new-task-property-options"
                    options={newTaskOptions}
                    placeholder="Priority or status…"
                    onChoose={(field, value) =>
                      field === "priority"
                        ? setPriority(Number(value))
                        : setStatus(value as Status)
                    }
                    onClose={() => setPropertyOpen(false)}
                  />
                )}
              </div>
            </div>
            <footer>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
              >
                {busy ? "Creating…" : "Create task"}
                <ArrowUpRight size={14} />
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}
