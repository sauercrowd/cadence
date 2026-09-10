import { TaskFilter } from "./TaskFilter";
import { Fragment, useRef, useState } from "react";
import { Check, Bot, List, Columns3, Plus, CircleDot } from "lucide-react";
import type { Task } from "../../data/api";
import { setQuery } from "../../app/router";
import { KeyHint, useShortcut, useShortcutKey } from "../../app/keys";
import { statusLabels, StatusIcon } from "./status";

export { statusLabels, StatusIcon };

type SegmentBy = "status" | "priority" | "phase";
type TaskSegment = { id: string; name: string; tasks: Task[] };

const segmentOptions: { id: SegmentBy; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "phase", label: "Phase" },
];
const recencyWindows: Record<string, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};
function withinRecency(timestamp: number, period: string, now: number) {
  if (!period) return true;
  const window = recencyWindows[period];
  return window !== undefined && timestamp >= now - window;
}

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
  const requestedSegment = route.searchParams.get("segment");
  const segment: SegmentBy = segmentOptions.some(
    (option) => option.id === requestedSegment,
  )
    ? (requestedSegment as SegmentBy)
    : "status";
  const search = (route.searchParams.get("q") || "").trim(),
    activity = route.searchParams.get("activity") || "",
    status = route.searchParams.get("status") || "",
    priority = route.searchParams.get("priority") || "",
    phase = route.searchParams.get("phase") || "",
    updated = route.searchParams.get("updated") || "",
    created = route.searchParams.get("created") || "";
  const now = Date.now();
  const scoped = tasks;
  const phases = new Map<string, string>();
  tasks.forEach((t) =>
    t.phases.forEach((p) => phases.set(p.definition.id, p.definition.name)),
  );
  const filtered = scoped
    .filter(
      (t) =>
        (archived || t.status !== "archived") &&
        (!search ||
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          String(t.number) === search.replace(/^#/, "")) &&
        (!activity ||
          (activity === "working"
            ? t.agentStatus === "working"
            : !t.agentStatus)) &&
        (!status || t.status === status) &&
        (!priority || String(t.priority) === priority) &&
        (!phase || t.currentPhaseId === phase) &&
        withinRecency(t.updatedAt, updated, now) &&
        withinRecency(t.createdAt, created, now),
    )
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.updatedAt - a.updatedAt ||
        a.id.localeCompare(b.id),
    );
  const segmentDefinitions: Record<SegmentBy, Omit<TaskSegment, "tasks">[]> = {
    status: [
      { id: "focus", name: "Focused" },
      { id: "open", name: "Todo" },
      { id: "done", name: "Done" },
      ...(archived ? [{ id: "archived", name: "Archived" }] : []),
    ],
    priority: [0, 1, 2, 3].map((value) => ({
      id: String(value),
      name: `P${value}`,
    })),
    phase: [...phases].map(([id, name]) => ({ id, name })),
  };
  const segments = segmentDefinitions[segment]
    .map((definition): TaskSegment => ({
      ...definition,
      tasks: filtered.filter((task) =>
        segment === "status"
          ? task.status === definition.id
          : segment === "priority"
            ? String(task.priority) === definition.id
            : task.currentPhaseId === definition.id,
      ),
    }))
    .filter((group) => group.tasks.length > 0);
  const orderedTasks = segments.flatMap((group) => group.tasks);
  const taskIndexes = new Map(
    orderedTasks.map((task, index) => [task.id, index]),
  );

  // Row cursor: j/k walk the segmented list, Enter opens. List view only —
  // the board is spatial, so a linear cursor would lie about where you are.
  const [cursor, setCursor] = useState(0);
  const rows = useRef<HTMLDivElement>(null);
  const at = Math.min(cursor, Math.max(0, orderedTasks.length - 1));
  const move = (delta: number) =>
    setCursor((c) => {
      const next = Math.min(
        Math.max(0, Math.min(c, orderedTasks.length - 1) + delta),
        orderedTasks.length - 1,
      );
      rows.current
        ?.querySelectorAll(".task-row")
        [next]?.scrollIntoView({ block: "nearest" });
      return next;
    });
  useShortcut("toggle-view", () => setQuery("view", board ? "list" : "board"));
  useShortcut("cycle-segment", () => {
    const index = segmentOptions.findIndex((option) => option.id === segment);
    setQuery("segment", segmentOptions[(index + 1) % segmentOptions.length].id);
  });
  useShortcutKey("jump-number", (key) => {
    const task = orderedTasks.find((t) => t.number === Number(key));
    if (task) onOpen(task);
  });
  useShortcut("row-next", () => move(1), !board && orderedTasks.length > 0);
  useShortcut("row-prev", () => move(-1), !board && orderedTasks.length > 0);
  useShortcut(
    "row-open",
    () => orderedTasks[at] && onOpen(orderedTasks[at]),
    !board && orderedTasks.length > 0,
  );
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
        <div className="segment-control has-hint">
          <label htmlFor="task-segment">Segment</label>
          <select
            id="task-segment"
            aria-label="Segment tasks by"
            title="Segment tasks · S cycles"
            value={segment}
            onChange={(event) => setQuery("segment", event.target.value)}
          >
            {segmentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <KeyHint id="cycle-segment" />
        </div>
        <div className="segmented has-hint">
          <KeyHint id="toggle-view" />
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
          {segments.map((column) => (
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
                    <span className="task-code">#{t.number}</span>
                    <span className={`priority p${t.priority}`}>
                      P{t.priority}
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
        <div className="task-table" ref={rows}>
          <div className="table-heading">
            <span>#</span>
            <span>Pri</span>
            <span>Task</span>
            <span>Status</span>
          </div>
          {segments.map((group) => (
            <Fragment key={group.id}>
              <div className="task-segment-heading">
                <span>{group.name}</span>
                <span>{group.tasks.length}</span>
              </div>
              {group.tasks.map((t) => {
                const index = taskIndexes.get(t.id);
                return (
                  <div
                    className={`task-row ${index === at ? "cursor" : ""}`}
                    key={t.id}
                  >
                    <span className="task-code">#{t.number}</span>
                    <span className={`priority p${t.priority}`}>
                      P{t.priority}
                    </span>
                    <button className="task-title" onClick={() => onOpen(t)}>
                      <StatusIcon status={t.status} />
                      <span>
                        <strong>{t.title}</strong>
                      </span>
                    </button>
                    <span className="task-status-cell">
                      <PhasePreview task={t} />
                      <span className="phase-label">
                        {t.phases.find(
                          (p) => p.definition.id === t.currentPhaseId,
                        )?.definition.name || "—"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
