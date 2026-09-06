import { TaskFilter } from "./TaskFilter";
import { useEffect } from "react";
import { Check, Bot, List, Columns3, Plus, CircleDot } from "lucide-react";
import type { Task } from "../../data/api";
import { setQuery } from "../../app/router";
import { statusLabels, StatusIcon } from "./status";

export { statusLabels, StatusIcon };
function PhasePreview({ task }: { task: Task }) {
  const current = task.phases.findIndex(
    (p) => p.definition.id === task.currentPhaseId,
  );
  return (
    <div
      className="phase-preview"
      role="list"
      aria-label={`${task.title} phase progress`}
    >
      {task.phases.map((phase, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <span
            key={phase.definition.id}
            role="listitem"
            className={`phase-preview-step ${state}`}
            aria-label={`${phase.definition.name}: ${state}`}
            title={`${phase.definition.name} · ${state}`}
          >
            <span className="phase-preview-bubble">
              {state === "done" && <Check size={8} strokeWidth={2} />}
            </span>
          </span>
        );
      })}
    </div>
  );
}
export function TaskOverview({
  tasks,
  route,
  onOpen,
  onCreate,
}: {
  tasks: Task[];
  route: URL;
  onOpen: (task: Task) => void;
  onCreate: () => void;
}) {
  const archived = route.searchParams.get("status") === "archived",
    board = route.searchParams.get("view") === "board";
  const search = (route.searchParams.get("q") || "").trim(),
    activity = route.searchParams.get("activity") || "",
    status = route.searchParams.get("status") || "",
    priority = route.searchParams.get("priority") || "",
    phase = route.searchParams.get("phase") || "";
  const scoped = tasks;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        document.querySelector("dialog[open]")
      )
        return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('[aria-label="Filter tasks"]')
          ?.focus();
      }
      if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        setQuery("view", board ? "list" : "board");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [board]);
  const filtered = scoped
    .filter(
      (t) =>
        (!search || t.title.toLowerCase().includes(search.toLowerCase())) &&
        (!activity ||
          (activity === "working"
            ? t.agentStatus === "working"
            : !t.agentStatus)) &&
        (!status || t.status === status) &&
        (!priority || String(t.priority) === priority) &&
        (!phase || t.currentPhaseId === phase),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.updatedAt - a.updatedAt ||
        a.id.localeCompare(b.id),
    );
  const phases = new Map<string, string>();
  tasks.forEach((t) =>
    t.phases.forEach((p) => phases.set(p.definition.id, p.definition.name)),
  );
  const columns = [
    {
      id: "open",
      name: "Open",
      tasks: filtered.filter((t) => t.status === "open"),
    },
    ...[...phases].map(([id, name]) => ({
      id,
      name,
      tasks: filtered.filter(
        (t) => t.status === "focus" && t.currentPhaseId === id,
      ),
    })),
    {
      id: "done",
      name: "Done",
      tasks: filtered.filter((t) => t.status === "done"),
    },
    {
      id: "archived",
      name: "Archived",
      tasks: filtered.filter((t) => t.status === "archived"),
    },
  ];
  return (
    <div className="overview">
      <header className="page-heading">
        <div>
          <h1>Tasks</h1>
        </div>
        <button className="button primary" onClick={onCreate}>
          <Plus size={15} />
          New task
        </button>
      </header>
      <div className="overview-toolbar">
        <TaskFilter route={route} phases={phases} />
        <div className="segmented">
          <button
            aria-label="List view"
            aria-pressed={!board}
            title="List view · V toggles view"
            className={!board ? "selected" : ""}
            onClick={() => setQuery("view", "list")}
          >
            <List size={15} />
          </button>
          <button
            aria-label="Board view"
            aria-pressed={board}
            title="Board view · V toggles view"
            className={board ? "selected" : ""}
            onClick={() => setQuery("view", "board")}
          >
            <Columns3 size={15} />
          </button>
        </div>
      </div>
      {!filtered.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <CircleDot size={24} />
          </div>
          <h2>{scoped.length ? "No matching tasks" : "No tasks yet"}</h2>
          <p>
            {scoped.length
              ? "Try another search or adjust your filters."
              : "Create a task to get started."}
          </p>
          {!archived && (
            <button className="button" onClick={onCreate}>
              <Plus size={14} />
              Create a task
            </button>
          )}
        </div>
      ) : board ? (
        <div className="board">
          {columns.map((column) => (
            <section className="board-column" key={column.id}>
              <header>
                <span className={`column-dot ${column.id}`} />
                {column.name}
                <span className="muted">{column.tasks.length}</span>
              </header>
              {column.tasks.map((t) => (
                <button
                  className="task-card"
                  onClick={() => onOpen(t)}
                  key={t.id}
                >
                  <div>
                    <span className={`priority p${t.priority}`}>
                      P{t.priority}
                    </span>
                    <span className="task-code">
                      {t.id.slice(0, 6).toUpperCase()}
                    </span>
                    {t.agentStatus && (
                      <Bot size={14} aria-label="Agent working" />
                    )}
                  </div>
                  <strong>{t.title}</strong>
                  <footer>
                    <StatusIcon status={t.status} />
                    {statusLabels[t.status]}
                  </footer>
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="task-table">
          <div className="table-heading">
            <span>Pri</span>
            <span>Task</span>
            <span>Status</span>
          </div>
          {filtered.map((t) => (
            <div className="task-row" key={t.id}>
              <span className={`priority p${t.priority}`}>P{t.priority}</span>
              <button className="task-title" onClick={() => onOpen(t)}>
                <StatusIcon status={t.status} />
                <span>
                  <strong>{t.title}</strong>
                </span>
              </button>
              <span className="task-status-cell">
                <PhasePreview task={t} />
                <span className="phase-label">
                  {t.phases.find((p) => p.definition.id === t.currentPhaseId)
                    ?.definition.name || "—"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
