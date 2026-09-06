import { ConnectError, Code } from "@connectrpc/connect";
import { api } from "../data/api";
import { readDraft, storeDraft } from "./drafts";

export type SessionState = {
  content: string;
  baseContent: string;
  revision: string;
  status: "loading" | "saved" | "unsaved" | "saving" | "conflict" | "error";
  error?: string;
  recoveryError?: string;
  diskContent?: string;
  diskRevision?: string;
  generation: number;
};
export class DocumentSession {
  private state: SessionState = {
    content: "",
    baseContent: "",
    revision: "",
    status: "loading",
    generation: 0,
  };
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;
  private ready?: Promise<void>;
  private persistQueue = Promise.resolve();
  scrollTop = 0;
  constructor(
    readonly key: string,
    readonly taskId: string,
    readonly documentId: string,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private persist() {
    const { content, baseContent, revision } = this.state;
    this.persistQueue = this.persistQueue
      .catch(() => {})
      .then(() =>
        storeDraft(
          this.key,
          content === baseContent
            ? null
            : { content, baseContent, revision, updatedAt: Date.now() },
        ),
      )
      .catch((error) => {
        this.update({ recoveryError: String(error) });
      });
  }
  load() {
    return (this.ready ??= (async () => {
      try {
        const doc = await api.document(this.taskId, this.documentId);
        let draft;
        try {
          draft = await readDraft(this.key);
        } catch (error) {
          this.update({ recoveryError: String(error) });
        }
        if (draft && draft.content !== doc.content)
          this.update({
            content: draft.content,
            baseContent: draft.baseContent,
            revision: draft.revision,
            status: draft.revision === doc.revision ? "unsaved" : "conflict",
            diskContent: doc.content,
            diskRevision: doc.revision,
          });
        else
          this.update({
            content: doc.content,
            baseContent: doc.content,
            revision: doc.revision,
            status: "saved",
          });
      } catch (error) {
        this.update({ error: String(error), status: "error" });
        this.ready = undefined;
      }
    })());
  }
  edit(content: string) {
    this.update({
      content,
      status:
        this.state.status === "conflict"
          ? "conflict"
          : content === this.state.baseContent
            ? "saved"
            : "unsaved",
      error: undefined,
    });
    this.persist();
    clearTimeout(this.timer);
    if (this.state.status !== "conflict")
      this.timer = setTimeout(() => void this.flush(), 650);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inFlight) {
      await this.inFlight;
      if (this.state.status === "unsaved") return this.flush();
      return;
    }
    if (
      !this.state.revision ||
      this.state.status === "conflict" ||
      this.state.content === this.state.baseContent
    )
      return;
    const content = this.state.content,
      revision = this.state.revision;
    this.update({ status: "saving" });
    this.inFlight = (async () => {
      try {
        const saved = await api.saveDocument(
          this.taskId,
          this.documentId,
          content,
          revision,
        );
        this.update({
          baseContent: content,
          revision: saved.revision,
          status: this.state.content === content ? "saved" : "unsaved",
          error: undefined,
        });
        this.persist();
      } catch (error) {
        if (ConnectError.from(error).code === Code.Aborted) {
          this.update({ status: "conflict" });
          try {
            const disk = await api.document(this.taskId, this.documentId);
            this.update({
              diskContent: disk.content,
              diskRevision: disk.revision,
            });
          } catch (error) {
            this.update({ error: String(error) });
          }
        } else this.update({ status: "error", error: String(error) });
      }
    })();
    await this.inFlight;
    this.inFlight = undefined;
    if (this.state.status === "unsaved") return this.flush();
  }
  async refresh() {
    if (this.inFlight || this.state.status === "loading") return;
    const revision = this.state.revision;
    try {
      const doc = await api.document(this.taskId, this.documentId);
      if (this.inFlight || revision !== this.state.revision) return;
      if (doc.revision === this.state.revision) return;
      if (this.state.content !== this.state.baseContent)
        this.update({
          status: "conflict",
          diskContent: doc.content,
          diskRevision: doc.revision,
        });
      else
        this.update({
          content: doc.content,
          baseContent: doc.content,
          revision: doc.revision,
          generation: this.state.generation + 1,
          status: "saved",
        });
    } catch (error) {
      this.update({ error: String(error) });
    }
  }
  resolve(content: string) {
    if (!this.state.diskRevision || this.state.diskContent === undefined)
      return;
    this.update({
      revision: this.state.diskRevision,
      baseContent: this.state.diskContent,
      diskContent: undefined,
      diskRevision: undefined,
      status: "unsaved",
      generation: this.state.generation + 1,
    });
    this.edit(content);
    void this.flush();
  }
}
const sessions = new Map<string, DocumentSession>();
export function documentSession(
  workspaceId: string,
  taskId: string,
  documentId: string,
) {
  const key = `${workspaceId}/${taskId}/${documentId}`;
  let session = sessions.get(key);
  if (!session) {
    session = new DocumentSession(key, taskId, documentId);
    sessions.set(key, session);
  }
  return session;
}
export function hasUnsavedDocuments() {
  return [...sessions.values()].some((session) => {
    const s = session.snapshot();
    return s.content !== s.baseContent;
  });
}
