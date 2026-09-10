import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import type { PhaseLink } from "../../data/api";
import { Modal } from "../../ui/Modal";

// Links open in a new tab, so they must never carry the opener along.
export function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function hostLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
export const linkLabel = (link: PhaseLink) => link.title || hostLabel(link.url);

/** The active phase's links live beside its title, not in the navigator. */
export function PhaseHeaderLinks({
  links,
  busy,
  onAdd,
  onDelete,
}: {
  links: PhaseLink[];
  busy: boolean;
  onAdd: () => void;
  onDelete: (link: PhaseLink) => void;
}) {
  return (
    <div className="phase-header-links" aria-label="Phase links">
      {links.map((link, index) => (
        <div className="phase-header-link" key={link.number}>
          <button
            className="phase-header-link-open"
            title={link.url}
            onClick={() => openLink(link.url)}
          >
            <span className="task-code">U{index + 1}</span>
            <span>{linkLabel(link)}</span>
            <ExternalLink size={11} />
          </button>
          <button
            className="phase-header-link-remove"
            aria-label={`Remove ${linkLabel(link)}`}
            disabled={busy}
            onClick={() => onDelete(link)}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        className="phase-header-link-add"
        aria-label="Add link to phase"
        title="Add link"
        disabled={busy}
        onClick={onAdd}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

/** Keyboard picker for `u`: type a number or arrow to a link, Enter opens it. */
export function PhaseLinkPicker({
  links,
  onClose,
}: {
  links: PhaseLink[];
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const open = (link: PhaseLink) => {
    onClose();
    openLink(link.url);
  };
  return (
    <Modal title="Open a phase link" onClose={onClose}>
      <div className="task-switcher">
        <input
          data-autofocus
          aria-label="Choose a link"
          role="combobox"
          aria-expanded="true"
          aria-controls="phase-link-results"
          aria-activedescendant={
            links.length ? `phase-link-${active}` : undefined
          }
          placeholder="Type a number, or ↑↓ then ↵"
          readOnly
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey)
              return;
            if (/^[1-9]$/.test(event.key)) {
              const link = links[Number(event.key) - 1];
              if (link) {
                event.preventDefault();
                open(link);
              }
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActive(
                (active + (event.key === "ArrowDown" ? 1 : -1) + links.length) %
                  (links.length || 1),
              );
            }
            if (event.key === "Enter" && links[active]) {
              event.preventDefault();
              open(links[active]);
            }
          }}
        />
        <div
          ref={list}
          className="task-switcher-results"
          role="listbox"
          id="phase-link-results"
          aria-label="Phase links"
        >
          {links.map((link, index) => (
            <div
              id={`phase-link-${index}`}
              role="option"
              aria-selected={active === index}
              key={link.number}
              className={active === index ? "active" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => open(link)}
            >
              <span className="task-code">U{index + 1}</span>
              <span>{linkLabel(link)}</span>
              <span className="link-url">{hostLabel(link.url)}</span>
            </div>
          ))}
          {!links.length && <p className="muted">No links on this phase</p>}
        </div>
      </div>
    </Modal>
  );
}
