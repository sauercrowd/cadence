import { Check, Circle, CircleMinus, LoaderCircle } from "lucide-react";

export function AgentStatus({
  status,
  iconOnly = false,
}: {
  status: string;
  iconOnly?: boolean;
}) {
  const normalized = ["working", "waiting", "done"].includes(status)
    ? status
    : "unknown";
  const Icon =
    normalized === "working"
      ? LoaderCircle
      : normalized === "waiting"
        ? CircleMinus
        : normalized === "done"
          ? Check
          : Circle;
  return (
    <span
      className={`agent-status ${normalized} ${iconOnly ? "icon-only" : ""}`}
      aria-label={`Agent status: ${normalized}`}
    >
      <Icon
        size={11}
        className={normalized === "working" ? "working-spin" : ""}
      />
      <span>{normalized}</span>
    </span>
  );
}
