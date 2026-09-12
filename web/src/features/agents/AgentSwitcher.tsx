import { useEffect, useRef, useState } from "react";
import type { Task } from "../../data/api";
import { Modal } from "../../ui/Modal";
import { AgentStatus } from "./AgentStatus";

export function AgentSwitcher({
  tasks,
  onOpen,
  onClose,
}: {
  tasks: Task[];
  onOpen: (task: Task, sessionId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const agents = tasks
    .flatMap((task) =>
      task.agents
        .filter((agent) => agent.active)
        .map((agent) => ({ task, agent })),
    )
    .filter(({ task, agent }) =>
      `${agent.name} ${task.title} ${task.number}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const selected = Math.min(active, Math.max(0, agents.length - 1));
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);
  const open = (index: number) => {
    const item = agents[index];
    if (!item) return;
    onClose();
    onOpen(item.task, item.agent.sessionId);
  };
  return (
    <Modal title="Go to agent" onClose={onClose}>
      <div className="task-switcher">
        <input
          data-autofocus
          aria-label="Find agent"
          role="combobox"
          aria-expanded="true"
          aria-controls="agent-switcher-results"
          placeholder="Agent or task…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive(
                (selected +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  agents.length) %
                  (agents.length || 1),
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              open(selected);
            }
          }}
        />
        <div
          ref={list}
          id="agent-switcher-results"
          role="listbox"
          aria-label="Agents"
          className="task-switcher-results"
        >
          {agents.map(({ task, agent }, index) => (
            <div
              key={`${task.id}/${agent.sessionId}`}
              role="option"
              aria-selected={selected === index}
              className={selected === index ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => open(index)}
            >
              <AgentStatus status={agent.status} iconOnly />
              <span>{agent.name}</span>
              <span className="task-code">#{task.number}</span>
            </div>
          ))}
          {!agents.length && <p className="muted">No active agents</p>}
        </div>
      </div>
    </Modal>
  );
}
