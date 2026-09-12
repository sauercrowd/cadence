import { ArrowLeft } from "lucide-react";
import type { Task } from "../../data/api";
import { AgentStatus } from "./AgentStatus";
import { useShortcut } from "../../app/keys";

export function AgentActivityPage({
  task,
  sessionId,
  onBack,
}: {
  task: Task;
  sessionId: string;
  onBack: () => void;
}) {
  useShortcut("back", onBack);
  const agent = task.agents.find((item) => item.sessionId === sessionId);
  if (!agent)
    return (
      <div className="empty-state">
        <h2>Agent unavailable</h2>
      </div>
    );
  const updates = task.agentUpdates.filter(
    (update) => update.sessionId === agent.sessionId,
  );
  return (
    <section className="agent-page">
      <header className="phase-header">
        <button
          className="icon-button"
          aria-label="Back to task"
          onClick={onBack}
        >
          <ArrowLeft size={14} />
        </button>
        <div>
          <span className="task-code">#{task.number}</span>
          <h2>{agent.name}</h2>
        </div>
      </header>
      <div className="agent-page-content agent-detail">
        <dl>
          <div>
            <dt>Status</dt>
            <dd>
              <AgentStatus status={agent.status} />
            </dd>
          </div>
          <div>
            <dt>Task</dt>
            <dd>{task.title}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{agent.scope || "—"}</dd>
          </div>
        </dl>
        <div className="section-label">ACTIVITY</div>
        {updates.map((update) => (
          <div className="agent-update" key={update.number}>
            <span>{update.body}</span>
            <time>{new Date(update.createdAt).toLocaleString()}</time>
          </div>
        ))}
        {!updates.length && <p className="muted">No updates.</p>}
      </div>
    </section>
  );
}
