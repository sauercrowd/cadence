import { useState } from "react";
import {
  useFloating,
  useHover,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  offset,
  flip,
  shift,
  autoUpdate,
  safePolygon,
  FloatingPortal,
} from "@floating-ui/react";
import { Check, RotateCcw, Send, X } from "lucide-react";
import type { Thread } from "../../documents/codec";

export function ThreadOverlay({
  thread,
  top,
  initialOpen = false,
  onReply,
  onResolve,
  onDismiss,
  onReattach,
  detached = thread.anchor.detached,
}: {
  thread: Thread;
  top: number;
  initialOpen?: boolean;
  onReply: (body: string) => void;
  onResolve: () => void;
  onDismiss?: () => void;
  onReattach?: () => void;
  detached?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen),
    [body, setBody] = useState("");
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next, _event, reason) => {
      setOpen(next);
      if (!next && reason === "escape-key") {
        (refs.reference.current as HTMLElement | null)?.focus();
        onDismiss?.();
      }
    },
    placement: "right-start",
    middleware: [offset(12), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    handleClose: safePolygon(),
    delay: { open: 200, close: 200 },
  });
  const click = useClick(context, { stickIfOpen: true });
  const dismiss = useDismiss(context),
    role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    click,
    dismiss,
    role,
  ]);
  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`comment-dot ${thread.status}`}
        style={{ top }}
        aria-label={
          thread.messages.length
            ? `Comment: ${thread.messages[0].body}`
            : "New comment"
        }
      >
        <span />
      </button>
      {open && (
        <FloatingPortal>
          <section
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="thread-overlay"
            aria-label="Comment thread"
          >
            <header>
              <span>
                {thread.status === "resolved" ? "Resolved thread" : "Comment"}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label={
                    thread.status === "open"
                      ? "Resolve thread"
                      : "Reopen thread"
                  }
                  onClick={onResolve}
                >
                  {thread.status === "open" ? (
                    <Check size={15} />
                  ) : (
                    <RotateCcw size={15} />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Close comment"
                  onClick={() => {
                    setOpen(false);
                    (refs.reference.current as HTMLElement | null)?.focus();
                    onDismiss?.();
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </header>
            <blockquote>{thread.anchor.quote}</blockquote>
            {detached && (
              <p className="muted small">
                Passage not found.{" "}
                {onReattach && (
                  <button className="text-button" onClick={onReattach}>
                    Attach to selection
                  </button>
                )}
              </p>
            )}
            <div className="thread-messages">
              {thread.messages.map((message) => (
                <article key={message.id}>
                  <div className="comment-author">
                    <span className="avatar">{message.author.slice(0, 1)}</span>
                    <strong>{message.author}</strong>
                    <time>
                      {new Date(message.createdAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </time>
                  </div>
                  <p>{message.body}</p>
                </article>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (body.trim()) {
                  onReply(body.trim());
                  setBody("");
                }
              }}
            >
              <textarea
                aria-label="Comment reply"
                placeholder={
                  thread.messages.length
                    ? "Reply to thread…"
                    : "Write a comment…"
                }
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <button
                className="button primary"
                disabled={!body.trim()}
                type="submit"
              >
                <Send size={13} />
                {thread.messages.length ? "Reply" : "Comment"}
              </button>
            </form>
          </section>
        </FloatingPortal>
      )}
    </>
  );
}
