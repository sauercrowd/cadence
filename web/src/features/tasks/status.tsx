import { Circle, CircleDot, CircleCheck, Archive } from "lucide-react";
import type { Status } from "../../data/api";

export const statusLabels: Record<Status, string> = {
  open: "Open",
  focus: "Focus",
  done: "Done",
  archived: "Archived",
};
export function StatusIcon({
  status,
  size = 15,
}: {
  status: Status;
  size?: number;
}) {
  const Icon = {
    open: Circle,
    focus: CircleDot,
    done: CircleCheck,
    archived: Archive,
  }[status];
  return <Icon size={size} className={`status-icon ${status}`} />;
}
