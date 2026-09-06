import { beforeEach, expect, test, vi } from "vitest";
import { ConnectError, Code } from "@connectrpc/connect";
import { DocumentSession } from "./session";
import { api } from "../data/api";
import { readDraft } from "./drafts";

vi.mock("../data/api", () => ({
  api: { document: vi.fn(), saveDocument: vi.fn() },
}));
vi.mock("./drafts", () => ({
  readDraft: vi.fn(),
  storeDraft: vi.fn().mockResolvedValue(undefined),
}));
const document = (
  content: string,
  revision: string,
): Awaited<ReturnType<typeof api.document>> => ({
  $typeName: "worker.v1.Document",
  id: "doc",
  taskId: "task",
  filename: "goal.md",
  name: "Goal",
  content,
  revision,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readDraft).mockResolvedValue(undefined);
  vi.mocked(api.document).mockResolvedValue(document("base", "r1"));
});

test("recovers a pending draft without overwriting changed disk content", async () => {
  vi.mocked(readDraft).mockResolvedValue({
    content: "local draft",
    baseContent: "old",
    revision: "r0",
    updatedAt: 1,
  });
  const session = new DocumentSession("recovery", "task", "doc");
  await session.load();
  expect(session.snapshot()).toMatchObject({
    content: "local draft",
    diskContent: "base",
    status: "conflict",
  });
  await session.flush();
  expect(api.saveDocument).not.toHaveBeenCalled();
});

test("serializes edits made while a save is in flight", async () => {
  const session = new DocumentSession("queue", "task", "doc");
  await session.load();
  let finish!: (value: ReturnType<typeof document>) => void;
  vi.mocked(api.saveDocument)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(document("second", "r3"));
  session.edit("first");
  const saving = session.flush();
  session.edit("second");
  finish(document("first", "r2"));
  await saving;
  expect(api.saveDocument).toHaveBeenNthCalledWith(
    2,
    "task",
    "doc",
    "second",
    "r2",
  );
  expect(session.snapshot()).toMatchObject({
    content: "second",
    revision: "r3",
    status: "saved",
  });
});

test("keeps both versions after a revision conflict", async () => {
  const session = new DocumentSession("conflict", "task", "doc");
  await session.load();
  vi.mocked(api.saveDocument).mockRejectedValueOnce(
    new ConnectError("changed", Code.Aborted),
  );
  vi.mocked(api.document).mockResolvedValue(document("external", "r2"));
  session.edit("local");
  await session.flush();
  expect(session.snapshot()).toMatchObject({
    content: "local",
    baseContent: "base",
    diskContent: "external",
    status: "conflict",
  });
});

test("upload completion preserves newer edits and saves without a mounted editor", async () => {
  const session = new DocumentSession("upload", "task", "doc");
  await session.load();
  const marker = "cadence-upload:1234-abcd";
  session.edit(`Before\n\n[Uploading x](${marker})\n\nAfter`);
  session.edit(`Edited before\n\n[Uploading x](${marker})\n\nEdited after`);
  const expected = "Edited before\n\n![](assets/x.png)\n\nEdited after";
  vi.mocked(api.saveDocument).mockResolvedValue(document(expected, "r2"));
  session.completeUpload(marker, "![](assets/x.png)");
  await session.flush();
  expect(api.saveDocument).toHaveBeenCalledWith("task", "doc", expected, "r1");
  expect(session.snapshot().generation).toBe(1);
  session.completeUpload(marker, "duplicate");
  expect(session.snapshot().content).toBe(expected);
});

test("upload completion does not resurrect a deleted insertion marker", async () => {
  const session = new DocumentSession("deleted-upload", "task", "doc");
  await session.load();
  session.completeUpload("cadence-upload:1234", "![](assets/x.png)");
  expect(session.snapshot().content).toBe("base");
  expect(session.snapshot().generation).toBe(0);
});
