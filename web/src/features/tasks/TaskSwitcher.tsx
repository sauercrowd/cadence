import { useEffect, useRef, useState } from "react";
import type { Task } from "../../data/api";
import { Modal } from "../../ui/Modal";
import { StatusIcon } from "./TaskOverview";

export function TaskSwitcher({
  tasks,
  onOpen,
  onClose,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const results = tasks
    .filter((task) => /^#?\d+$/.test(query.trim())
      ? String(task.number) === query.trim().replace(/^#/, "")
      : task.title.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.status === "focus") - Number(a.status === "focus") ||
        a.priority - b.priority ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
  const selected = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  const jump = (task: Task) => {
    onClose();
    onOpen(task);
  };
  return (
    <Modal title="Go to task" onClose={onClose}>
      <div className="task-switcher">
        <input
          data-autofocus
          aria-label="Find task"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="task-switcher-results"
          aria-activedescendant={
            results.length ? `task-jump-${selected}` : undefined
          }
          placeholder="Task ID or title…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (
              event.nativeEvent.isComposing ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey
            )
              return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive(
                (selected +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  results.length) %
                  (results.length || 1),
              );
            }
            if (event.key === "Enter" && results[selected]) {
              event.preventDefault();
              jump(results[selected]);
            }
          }}
        />
        <div
          ref={list}
          className="task-switcher-results"
          role="listbox"
          id="task-switcher-results"
          aria-label="Tasks"
        >
          {results.map((task, index) => (
            <div
              id={`task-jump-${index}`}
              role="option"
              aria-selected={selected === index}
              key={task.id}
              className={selected === index ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => jump(task)}
            >
              <StatusIcon status={task.status} />
              <span>{task.title}</span>
              <span className="task-code">#{task.number}</span>
            </div>
          ))}
          {!results.length && (
            <p className="muted">
              {tasks.length ? "No matching tasks" : "No tasks yet"}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
