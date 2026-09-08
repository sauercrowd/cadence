import { useEffect, useRef } from "react";

/**
 * One registry for every shortcut. Bindings, the hint badges, and the
 * shortcut sheet all read from here, so they cannot drift apart.
 */
export type Shortcut = {
  id: string;
  keys: string[];
  label: string;
  scope: "Global" | "Task list" | "Task";
  /** Shown on the badge and in the sheet; defaults to the first key. */
  hint?: string;
};

export const SHORTCUTS: Shortcut[] = [
  { id: "new-task", keys: ["c"], label: "New task", scope: "Global" },
  { id: "go-to-task", keys: ["g"], label: "Go to task", scope: "Global" },
  { id: "tasks", keys: ["t"], label: "Tasks", scope: "Global" },
  { id: "phases", keys: ["p"], label: "Phases", scope: "Global" },
  { id: "filter", keys: ["/"], label: "Search and filter", scope: "Global" },
  { id: "shortcuts", keys: ["?"], label: "Shortcuts", scope: "Global" },
  {
    // Anything numbered on screen is addressable by its number.
    id: "jump-number",
    keys: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
    label: "Type an ID to jump (pause to open)",
    scope: "Global",
    hint: "0–9",
  },

  {
    id: "row-next",
    keys: ["j", "ArrowDown"],
    label: "Next task",
    scope: "Task list",
    hint: "J",
  },
  {
    id: "row-prev",
    keys: ["k", "ArrowUp"],
    label: "Previous task",
    scope: "Task list",
    hint: "K",
  },
  {
    id: "row-open",
    keys: ["Enter"],
    label: "Open task",
    scope: "Task list",
    hint: "↵",
  },
  {
    id: "toggle-view",
    keys: ["v"],
    label: "List or board",
    scope: "Task list",
  },

  {
    id: "back",
    keys: ["Escape"],
    label: "Back to tasks",
    scope: "Task",
    hint: "Esc",
  },
  { id: "doc-prev", keys: ["["], label: "Previous document", scope: "Task" },
  { id: "doc-next", keys: ["]"], label: "Next document", scope: "Task" },
  {
    id: "make-current",
    keys: ["m"],
    label: "Make phase current",
    scope: "Task",
  },
  { id: "edit", keys: ["e"], label: "Edit document", scope: "Task" },
  // Bound inside the editor, not globally: it has to fire while the caret is
  // in the document, which a bare letter cannot do.
  {
    id: "add-comment",
    keys: ["M"],
    label: "Comment on selection",
    scope: "Task",
    hint: "⌘⌥M",
  },
  { id: "phase-links", keys: ["u"], label: "Open a phase link", scope: "Task" },
];

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function shortcut(id: string): Shortcut {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown shortcut: ${id}`);
  return found;
}
export function keyLabel(s: Shortcut) {
  return s.hint ?? s.keys[0].toUpperCase();
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}

/**
 * Binds one registered shortcut. Ignored while typing or while a dialog is
 * open, so shortcuts never eat real input. Alt may be held (that's how the
 * hint badges are revealed), which on macOS changes event.key, so letters
 * also match on event.code.
 */
export function useShortcut(id: string, run: () => void, enabled = true) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    const keys = shortcut(id).keys;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.repeat || event.isComposing)
        return;
      const hit =
        keys.includes(event.key) ||
        keys.some(
          (k) => k.length === 1 && event.code === `Key${k.toUpperCase()}`,
        );
      if (!hit) return;
      if (isTyping(event.target) || document.querySelector("dialog[open]"))
        return;
      event.preventDefault();
      latest.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, enabled]);
}

/** Same, but the handler receives which key matched (for 1–9). */
export function useShortcutKey(
  id: string,
  run: (key: string) => void,
  enabled = true,
) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    const keys = shortcut(id).keys;
    let digits = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.repeat || event.isComposing)
        return;
      if (!keys.includes(event.key)) {
        clearTimeout(timer);
        digits = "";
        return;
      }
      if (isTyping(event.target) || document.querySelector("dialog[open]"))
        return;
      event.preventDefault();
      digits += event.key;
      clearTimeout(timer);
      timer = setTimeout(() => {
        latest.current(digits);
        digits = "";
      }, 400);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [id, enabled]);
}

/**
 * Holding Alt reveals every hint badge at once. Nothing is shown at rest, so
 * the interface stays quiet until you ask.
 */
export function useHintMode() {
  useEffect(() => {
    const show = (event: KeyboardEvent) => {
      if (
        event.key === "Alt" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !document.querySelector("dialog[open]")
      )
        document.body.dataset.keys = "on";
    };
    const hide = () => delete document.body.dataset.keys;
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") hide();
    };
    window.addEventListener("keydown", show);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", show);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", hide);
      hide();
    };
  }, []);
}

/** Positioned over its control; invisible until Alt is held. */
export function KeyHint({ id }: { id: string }) {
  return (
    <kbd className="key-hint" aria-hidden="true">
      {keyLabel(shortcut(id))}
    </kbd>
  );
}
