---
name: cadence
description: Read, create, edit, and delete work inside a Cadence project workspace (the .cadence directory). Use when tasks, documents, phases, comments, or attachments need to be manipulated directly, with or without the Cadence server running.
---

# Working with a Cadence workspace

A Cadence workspace is a `.cadence/` directory inside a project root. It is
plain files — JSON plus Markdown — so an agent can operate on it with file
tools. Prefer the HTTP API when the server is running; edit files directly
only when it is not, and never do both at once.

## Layout

```text
<project>/
├── .cadence/
│   ├── workspace.json          { id (uuid), name, logoPath? }
│   ├── workflow.json           { phases: [{ id, name, mode, documentTemplate }] }
│   ├── trash/                  deleted tasks/documents (recovery only)
│   └── tasks/<task-uuid>/
│       ├── task.json           metadata, document index, phase links
│       ├── <slug>.md           documents (phase docs + supporting docs)
│       ├── assets/             attachments referenced by the documents
│       └── history/            per-revision backups (recovery only)
└── <project files the logo may point at>
```

`trash/` and `history/` are recovery mechanisms. Read them to restore
content; never write them by hand. Deletions move files there instead of
removing them.

## workspace.json and workflow.json

`workspace.json`: `{ "id": "<uuid>", "name": "<dir name>", "logoPath"? }`.
`logoPath` is a project-relative image path (`assets/logo.png`, resolved
against the project root, never inside `.cadence/`). Omit it for no logo.

`workflow.json`: `{ "phases": [...] }` with 1–24 phases. Each phase:
`{ "id": "goal", "name": "Goal planning", "mode": "interactive" |
"async", "documentTemplate": "# Goal\n..." }`. IDs match
`^[a-zA-Z0-9_-]{1,80}$` and must be unique; names must be non-blank.

## task.json

```json
{
  "schemaVersion": 1,
  "id": "<uuid>",
  "name": "Do the thing",
  "documents": [{ "id": "<uuid>", "name": "Goal planning", "filename": "goal.md" }],
  "createdAt": "2026-09-06T16:00:00Z",
  "updatedAt": "2026-09-06T16:00:00Z",
  "status": "open",
  "priority": 2,
  "agentStatus": null,
  "currentPhaseId": "goal",
  "phases": [{ "phaseId": "goal", "documentId": "<uuid>" }]
}
```

Rules the server enforces — a file edit that breaks them makes the task
unreadable until repaired:

- `status` is one of `open`, `focus`, `done`, `archived`; `priority` is
  `0`–`3` (default `2`); `agentStatus` is `"working"` or `null`.
- Every document entry needs a uuid `id`, and `filename` must be a bare
  `*.md` name (no directories, no separators). Filenames are unique per
  task, case-insensitively; derive them by slugifying the title
  (lowercase, runs of non-alphanumerics become one `-`) and appending
  `-2`, `-3`, … on collision.
- Every `phases[].documentId` must exist in `documents`. Phase
  *definitions* (name, mode, template) are resolved live from
  `workflow.json` on every read — only `phaseId` + `documentId` persist.
- Removing a phase ID from `workflow.json` drops it from tasks but keeps
  its document as a supporting document. Phase documents cannot be
  deleted while a phase references them.
- New phases in `workflow.json` materialize a fresh document from
  `documentTemplate` in every task on next read, so adding a phase has
  immediate, workspace-wide effects. Prefer API reads after such a change
  to see what was created.

## Documents

A document file is Markdown body first, machine sections after:

````md
# Title

Body text. Images and videos referenced by relative path:
![alt](assets/3f9a….png) and <video src="assets/7c1d….mp4" controls></video>

<agent-instructions>
Prompt text for the agent working this phase.
</agent-instructions>
```cadence-comments
{"version": 2, "threads": [ … ]}
```
````

- `<agent-instructions>` must be unindented, unfenced, tags on their own
  lines. It may sit anywhere; inner text is the prompt verbatim.
- `cadence-comments` must be the trailing block, an unindented fenced code block containing JSON. Each thread:
  `{ "id", "status": "open" | "resolved", "anchor": { "version": 1,
  "start", "end", "quote", "prefix", "suffix" }, "messages": [{ "id",
  "author", "body", "createdAt" }], "createdAt", "updatedAt" }`.
  Thread IDs must be unique; `version` must be `2`.
- Anchors are offsets into the document's *text* (Markdown stripped), and
  the app re-resolves them by `quote` plus surrounding context. Editing
  around a thread is safe; rewriting its quoted passage detaches it.
  Never hand-edit the envelope unless you can keep the JSON valid —
  corruption forces the document into a manual repair mode.
- The rich editor round-trips headings, emphasis, links, lists,
  checklists, tables, code fences, rules, images, videos, and `cadence-html` fenced blocks rendered as sandboxed
  HTML embeds. Ordinary `html` fences display code. Raw `<iframe>` tags
  stay in source mode. Anything else (other raw HTML, footnotes, reference
  links) is source-only: still editable, but only as raw text.

## Attachments

Files live in `tasks/<id>/assets/<uuid>.<ext>` and are referenced from
Markdown as `assets/<uuid>.<ext>`. Images (`png jpg gif webp svg`) and videos
(`mp4 webm ogv`) preview inline; everything else serves as a download.
Never reference absolute paths — documents must stay portable.

## Revisions and conflicts (API use)

Every read returns a `revision`: the sha256 hex of the raw file bytes
(`task.json`, `workflow.json`, or the document). Every write must send
back the revision it was based on; a mismatch is rejected as a conflict.
On conflict, re-read, re-apply the change onto the fresh content, and
retry. Overwrites keep a per-revision backup under `history/`
automatically — no manual backup step needed.

The API is Connect JSON: `POST
/api/worker.v1.WorkspaceService/<Method>` with a JSON body, served under
`/api` by the Cadence server (default `http://127.0.0.1:7331`):

- `ListTasks {}` → tasks plus non-fatal per-task errors.
- `CreateTask {name}` / `RenameTask {taskId, name}` / `DeleteTask
  {taskId}` (moves the task directory to `trash/`).
- `GetTask {taskId}` → task with live phase definitions, document
  index, and revision.
- `UpdateTask {id, revision, name?, status?, priority?, agentStatus?,
  currentPhaseId?, updateMask: {paths: [...]}}` — `status` is
  `TASK_STATUS_OPEN|FOCUS|DONE|ARCHIVED`, `agentStatus`
  `AGENT_STATUS_WORKING|NONE`. Mask paths use the proto names:
  `name`, `status`, `priority`, `agent_status`, `current_phase_id`.
  Advancing a phase is `currentPhaseId` + mask `["current_phase_id"]`
  (the ID must be one of the task's phases).
- `CreateDocument {taskId, name}` / `GetDocument {taskId, documentId}`
  → `{id, taskId, name, filename, content, revision}`.
- `UpdateDocument {taskId, documentId, content, revision}` — `content`
  is the *entire* file, envelope included.
- `RenameDocument {taskId, documentId, name}` (renames the file too) /
  `DeleteDocument {taskId, documentId}` (moves the file to `trash/`).
- `GetWorkflow {}` / `UpdateWorkflow {workflow, revision}`.
- `GetWorkspace {}` → `{id, name, logoPath}`.
- Attachments live outside RPC: `POST
  /api/tasks/{taskId}/attachments` with the raw bytes as body,
  `Content-Type` set, and the original name in an url-encoded
  `X-Filename` header → `{"name": "<stored>"}`. `GET
  /api/tasks/{taskId}/attachments/{name}` serves it. 10 MB limit.
  `GET /api/workspace/logo` serves the configured logo.

## Recipes

- **New task with content**: `CreateTask`, then `UpdateDocument` on each
  phase document (empty template bodies welcome real content).
- **Edit a document**: `GetDocument`, modify `content` preserving the
  envelope blocks, `UpdateDocument` with the returned revision.
- **Advance the phase**: `UpdateTask` with `currentPhaseId` set to the
  next workflow phase ID.
- **Resolve a thread**: flip its `status` to `"resolved"` (keep
  `updatedAt` fresh) and `UpdateDocument` the whole file.
- **Add a file to a document**: upload first, then reference the
  returned name — `![alt](name)` for images, `<video src="name"
  controls></video>` for video, `[label](name)` otherwise.

## Do not

- Do not edit files while the server is running against the same
  workspace — its revision protocol and locks assume API writes, and a
  write landing between its check and save loses.
- Do not invent non-uuid IDs, reuse IDs across objects, or reference
  document IDs that are not in the task's `documents` index.
- Do not move or rename the `.cadence` directory contents by hand to
  "reorganize" — the index is the source of truth, not the filenames.
- Do not commit `.cadence/` to version control; it is local working
  state (the project template ignores it).
