import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type PropertyOption = { id: string; label: string };
export type PropertyField = {
  id: string;
  label: string;
  options: PropertyOption[];
};
export type FlatOption = { field: string; id: string; label: string };

// Flattens one or more fields into a single option list. Values across the
// default fields (priority, status, phase, agent activity) never collide, so
// the "/" picker can offer them directly without a field-selection step.
export function flattenFields(fields: PropertyField[]): FlatOption[] {
  return fields.flatMap((field) =>
    field.options.map((option) => ({
      field: field.id,
      id: option.id,
      label: option.label,
    })),
  );
}

export function usePropertyMenu(options: FlatOption[]) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = Math.min(active, Math.max(0, filtered.length - 1));
  function onKeyDown(
    event: KeyboardEvent,
    onChoose: (fieldId: string, valueId: string) => void,
    onClose: () => void,
  ) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (selected + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) %
          (filtered.length || 1),
      );
      return;
    }
    if (event.key === "Enter" && filtered[selected]) {
      event.preventDefault();
      onChoose(filtered[selected].field, filtered[selected].id);
    }
  }
  return { query, setQuery, options: filtered, active: selected, onKeyDown };
}

export function PropertyMenuList({
  id,
  label,
  options,
  active,
  onPick,
}: {
  id: string;
  label: string;
  options: FlatOption[];
  active: number;
  onPick: (fieldId: string, valueId: string) => void;
}) {
  return (
    <div
      className="property-menu-list"
      role="listbox"
      id={id}
      aria-label={label}
    >
      {options.map((option, index) => (
        <button
          key={`${option.field}:${option.id}`}
          role="option"
          id={`${id}-${index}`}
          aria-selected={index === active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(option.field, option.id)}
        >
          {option.label}
        </button>
      ))}
      {!options.length && <p className="muted">No matches</p>}
    </div>
  );
}

// A self-contained popup: search input + PropertyMenuList, positioned by its
// `.property-menu` CSS against a `position: relative` ancestor the caller
// provides. Mount it conditionally on `open`; it reports a choice and asks
// to be closed, but never unmounts itself. `options` is a flat value list
// (see flattenFields) — there is no field-selection level.
export function PropertyPopup({
  id,
  options,
  label = "Task properties",
  placeholder = "Choose a value…",
  onChoose,
  onClose,
}: {
  id: string;
  options: FlatOption[];
  label?: string;
  placeholder?: string;
  onChoose: (fieldId: string, valueId: string) => void;
  onClose: () => void;
}) {
  const menu = usePropertyMenu(options);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (fieldId: string, valueId: string) => {
    onChoose(fieldId, valueId);
    onClose();
  };
  return (
    <div className="property-menu" ref={root}>
      <input
        ref={search}
        aria-label="Change task property"
        role="combobox"
        aria-expanded="true"
        aria-controls={id}
        aria-activedescendant={
          menu.options.length ? `${id}-${menu.active}` : undefined
        }
        placeholder={placeholder}
        value={menu.query}
        onChange={(event) => menu.setQuery(event.target.value)}
        onKeyDown={(event) => menu.onKeyDown(event, choose, onClose)}
      />
      <PropertyMenuList
        id={id}
        label={label}
        options={menu.options}
        active={menu.active}
        onPick={choose}
      />
    </div>
  );
}
