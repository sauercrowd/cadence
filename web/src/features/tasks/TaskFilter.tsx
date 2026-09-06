import { useState } from "react";
import { Search, X } from "lucide-react";
import { navigate, setQuery } from "../../app/router";
import {
  PropertyPopup,
  flattenFields,
  type PropertyField,
} from "../../ui/PropertyMenu";
import { priorityField, statusField } from "./propertyFields";

const activityField: PropertyField = {
  id: "activity",
  label: "Agent activity",
  options: [
    { id: "working", label: "Working" },
    { id: "input", label: "Not working" },
  ],
};
const fieldLabels: Record<string, string> = {
  priority: "Priority",
  status: "Status",
  phase: "Phase",
  activity: "Agent activity",
};

export function TaskFilter({
  route,
  phases,
}: {
  route: URL;
  phases: Map<string, string>;
}) {
  const value = route.searchParams.get("q") || "";
  const [open, setOpen] = useState(false);
  const phaseField: PropertyField = {
    id: "phase",
    label: "Phase",
    options: [...phases].map(([id, label]) => ({ id, label })),
  };
  const allFields = [priorityField, statusField, phaseField, activityField];
  const options = flattenFields(allFields);
  const valueLabel = (field: string, id: string) =>
    allFields.find((f) => f.id === field)?.options.find((o) => o.id === id)
      ?.label || id;
  return (
    <div className="task-filter">
      <div className="task-filter-input">
        <Search size={14} className="muted" />
        {["priority", "status", "phase", "activity"].map((field) => {
          const id = route.searchParams.get(field);
          if (!id) return null;
          return (
            <button
              key={field}
              className="filter-token"
              aria-label={`Remove ${fieldLabels[field]}: ${valueLabel(field, id)}`}
              onClick={() => setQuery(field, "")}
            >
              <span>
                {fieldLabels[field]}: {valueLabel(field, id)}
              </span>
              <X size={11} />
            </button>
          );
        })}
        <input
          aria-label="Filter tasks"
          placeholder="Filter… / for priority, status, phase, activity"
          value={value}
          onChange={(event) => setQuery("q", event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "/" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
      </div>
      {open && (
        <PropertyPopup
          id="task-filter-options"
          options={options}
          placeholder="Priority, status, phase, activity…"
          onChoose={(field, id) => {
            const url = new URL(route);
            url.searchParams.set(field, id);
            navigate(url.pathname + url.search);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
