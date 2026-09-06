import type { PropertyField } from "../../ui/PropertyMenu";
import { statusLabels } from "./status";

export const priorityField: PropertyField = {
  id: "priority",
  label: "Priority",
  options: [0, 1, 2, 3].map((p) => ({ id: String(p), label: `P${p}` })),
};
export const statusField: PropertyField = {
  id: "status",
  label: "Status",
  options: Object.entries(statusLabels).map(([id, label]) => ({
    id,
    label,
  })),
};
