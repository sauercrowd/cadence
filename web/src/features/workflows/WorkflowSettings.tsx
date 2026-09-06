import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { api, type PhaseDefinition } from "../../data/api";
import { z } from "zod";

const workflowSchema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
      name: z.string().trim().min(1).max(120),
      mode: z.enum(["interactive", "async"]),
      documentTemplate: z.string(),
    }),
  )
  .min(1)
  .max(24)
  .refine(
    (phases) => new Set(phases.map((p) => p.id)).size === phases.length,
    "Phase IDs must be unique",
  );
let draft:
  { phases: PhaseDefinition[]; revision: string; selected: string } | undefined;

export function WorkflowSettings({
  onError,
}: {
  onError: (error: unknown) => void;
}) {
  const [phases, setPhases] = useState<PhaseDefinition[]>(draft?.phases ?? []);
  const [revision, setRevision] = useState(draft?.revision ?? "");
  const [selected, setSelected] = useState(draft?.selected ?? "");
  const [dirty, setDirty] = useState(!!draft);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (draft) return;
    let active = true;
    void api
      .workflow()
      .then((w) => {
        if (active) {
          setPhases(w.phases);
          setRevision(w.revision);
          setSelected(w.phases[0]?.id ?? "");
        }
      })
      .catch(onError);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    draft = dirty ? { phases, revision, selected } : undefined;
  }, [phases, revision, selected, dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const index = phases.findIndex((p) => p.id === selected);
  const phase = phases[index];
  function update(patch: Partial<PhaseDefinition>) {
    setPhases((current) =>
      current.map((p) => (p.id === selected ? { ...p, ...patch } : p)),
    );
    setDirty(true);
  }
  function move(delta: number) {
    const next = [...phases];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setPhases(next);
    setDirty(true);
  }
  async function save() {
    setBusy(true);
    try {
      const result = await api.updateWorkflow(
        workflowSchema.parse(phases),
        revision,
      );
      setPhases(result.phases);
      setRevision(result.revision);
      setDirty(false);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workflow-settings">
      <header className="page-heading">
        <h1>Phases</h1>
        <button
          className="button primary"
          disabled={!dirty || busy}
          onClick={() => void save()}
        >
          <Save size={14} />
          {busy ? "Saving…" : "Save workflow"}
        </button>
      </header>
      <p className="settings-note">
        Changes apply immediately to every task. Renaming, reordering, or
        editing a phase updates it everywhere it's used; removing a phase
        keeps its document as a supporting document on affected tasks.
      </p>
      <div className="workflow-layout">
        <nav className="workflow-phase-list" aria-label="Workflow phases">
          {phases.map((p, i) => (
            <button
              key={p.id}
              className={p.id === selected ? "active" : ""}
              aria-current={p.id === selected ? "true" : undefined}
              onClick={() => setSelected(p.id)}
            >
              <span className="muted">{i + 1}</span>
              <span>{p.name || "Untitled phase"}</span>
            </button>
          ))}
          <button
            className="text-button add-phase"
            disabled={busy || phases.length >= 24}
            onClick={() => {
              const p = {
                id: crypto.randomUUID(),
                name: "New phase",
                mode: "interactive",
                documentTemplate: "",
              };
              setPhases((current) => [...current, p]);
              setSelected(p.id);
              setDirty(true);
            }}
          >
            <Plus size={14} />
            Add phase
          </button>
        </nav>
        {phase ? (
          <fieldset className="workflow-phase-details" disabled={busy}>
            <div className="phase-detail-actions">
              <button
                className="icon-button"
                title="Move up"
                aria-label={`Move ${phase.name} up`}
                disabled={index === 0}
                onClick={() => move(-1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                title="Move down"
                aria-label={`Move ${phase.name} down`}
                disabled={index === phases.length - 1}
                onClick={() => move(1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-button"
                title="Remove phase"
                aria-label={`Remove ${phase.name}`}
                disabled={phases.length === 1}
                onClick={() => {
                  const next = phases.filter((p) => p.id !== selected);
                  setPhases(next);
                  setSelected(next[Math.min(index, next.length - 1)].id);
                  setDirty(true);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="phase-title-mode">
              <label>
                Title
                <input
                  aria-label={`Phase ${index + 1} name`}
                  value={phase.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </label>
              <label>
                Mode
                <select
                  value={phase.mode}
                  onChange={(event) => update({ mode: event.target.value })}
                >
                  <option value="interactive">Interactive</option>
                  <option value="async">Async</option>
                </select>
              </label>
            </div>
            <label>
              Template <span className="muted">Optional</span>
              <textarea
                className="monospace"
                rows={16}
                placeholder="Leave empty to start with a blank document"
                value={phase.documentTemplate}
                onChange={(event) =>
                  update({ documentTemplate: event.target.value })
                }
              />
              <p className="field-hint">
                The starting content for this phase's document. Wrap agent
                instructions in{" "}
                <code>{"<agent-instructions>…</agent-instructions>"}</code> so
                they travel with the document and collapse when viewing the
                task.
              </p>
            </label>
          </fieldset>
        ) : (
          <p className="muted">Loading phases…</p>
        )}
      </div>
    </div>
  );
}
