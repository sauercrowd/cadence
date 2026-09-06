import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Task, Status } from "../../data/api";
import { statusLabels, StatusIcon } from "./TaskOverview";
import { PropertyPopup, flattenFields } from "../../ui/PropertyMenu";
import { priorityField, statusField } from "./propertyFields";
import { KeyHint } from "../../app/keys";

const priorityOptions = flattenFields([priorityField]);
const statusOptions = flattenFields([statusField]);
const allOptions = flattenFields([priorityField, statusField]);

export function TaskHeading({
  task,
  busy,
  onUpdate,
  onBack,
}: {
  task: Task;
  busy: boolean;
  onUpdate: (patch: {
    title?: string;
    priority?: number;
    status?: Status;
  }) => void;
  onBack?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [options, setOptions] = useState(allOptions);
  const title = useRef<HTMLInputElement>(null);
  function show(scoped = allOptions) {
    setOptions(scoped);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    title.current?.focus();
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.isComposing &&
        !target.isContentEditable &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !document.querySelector("dialog[open]")
      ) {
        event.preventDefault();
        show();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="task-heading-line">
      {onBack && (
        <button
          className="icon-button"
          aria-label="Back to tasks"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          <KeyHint id="back" />
        </button>
      )}
      <button
        className="task-status-button"
        aria-label={`Task status: ${statusLabels[task.status]}`}
        title={statusLabels[task.status]}
        disabled={busy}
        onClick={() => show(statusOptions)}
      >
        <StatusIcon status={task.status} />
      </button>
      <button
        className={`priority p${task.priority}`}
        aria-label="Task priority"
        disabled={busy}
        onClick={() => show(priorityOptions)}
      >
        P{task.priority}
      </button>
      <input
        ref={title}
        className="task-heading-input"
        aria-label="Task title"
        defaultValue={task.title}
        key={task.id + task.title}
        onBlur={(event) => {
          if (
            event.target.value.trim() &&
            event.target.value !== task.title
          )
            onUpdate({ title: event.target.value.trim() });
        }}
        onKeyDown={(event) => {
          if (event.key === "/" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            show();
          }
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {open && (
        <PropertyPopup
          id="task-property-options"
          options={options}
          onChoose={(field, value) => {
            if (busy) return;
            onUpdate(
              field === "priority"
                ? { priority: Number(value) }
                : { status: value as Status },
            );
          }}
          onClose={close}
        />
      )}
    </div>
  );
}
