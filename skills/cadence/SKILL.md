---
name: cadence
description: Whenever a .cadence directory is available, use cadence to track and manage the work you're doing.
---

# What is Cadence
It is an opinionated tool to manage tasks between a user and agents, and not just track them but also have an opinion on how to move them from problem to solution systematically.
With the goal that the user needs to think about less on how to structure the work but instead can focus on the problem at hand.

It does it by mostly tracking tasks, and each tasks is broken down into phases (when it's a larger piece of work).
The phases are configured centrally and make it clear what is expected from the user, from the agent, and if it's an interactive or async task.
An interactive task means the user is fully focused on it, an async tasks mean the user will switch away to do other things so the agent should spend more time on validating proactively so that
when the user comes back as much as possible is moved out of the way.

A phase just consists of a title and a markdown doc. The markdown doc is the "spec" for that task, but it contains an <agent-instructions></agent-instructions> section that is default hidden (since it will change rarely). in the agent instructions - if exists - are any extra instructions to you when working on that task. The spec itself will define what you're agreeing on with the user.
The spec supports adding comments (both by you and the user), which will just get dumped in a special comments section in the markdown so it's simple (that section will be hidden from the user, and the comments will be rendered out nicely and overlay appropriately).

Example phases of a project might be: goal planning, implementation planning, implementation, review. In that case the idea is that you first super interatively decomp the goal, then in the next step agree on modelling, locations in the codebase, ..., and finally implementation where you should work by yourself as much as possible, e.g. explictly validating coding standards, ...

The markdown supports both dropping in files/screenshots for the user (images/videos are rendered inline), but also a special cadence-html codeblock.
Code in that codeblock will be rendered in an iframe, which is perfect if you want to show actual UI components for example or even just embed custom sketches, ...

If you think the phases could be improved (both spec template and agent instructions), or anything is unclear, let the user know.

# Working with a Cadence workspace

A workspace is a `.cadence/` directory in a project root, served by the Cadence
server at **`http://127.0.0.1:7331`**. Everything — tasks, phases, subphases,
documents, links, attachments — goes through that server. Treat `.cadence/`
itself as opaque: do not read or write the database or the Markdown files
directly, and do not try to keep them in sync by hand.

If the server is not running, start it (`cadence [project-directory]`, or
`go run .` in the Cadence repo) rather than falling back to files.

## The API

It is a [Connect](https://connectrpc.com) service, so every method is available
as plain JSON over HTTP `POST`:

```
POST http://127.0.0.1:7331/api/worker.v1.WorkspaceService/<Method>
Content-Type: application/json

<request message as JSON>
```

JSON uses lowerCamelCase field names (`task_id` → `taskId`). Enums are their
full string names (`"TASK_STATUS_FOCUS"`). This is the whole schema:

```proto
service WorkspaceService {
  rpc GetWorkspace(google.protobuf.Empty) returns (WorkspaceInfo);
  rpc ListTasks(google.protobuf.Empty) returns (ListTasksResponse);
  rpc GetTask(TaskRequest) returns (Task);
  rpc CreateTask(CreateTaskRequest) returns (Task);
  rpc RenameTask(RenameTaskRequest) returns (Task);
  rpc UpdateTask(UpdateTaskRequest) returns (Task);
  rpc DeleteTask(TaskRequest) returns (google.protobuf.Empty);

  rpc CreateSubphase(CreateSubphaseRequest) returns (Task);
  rpc UpdateSubphase(UpdateSubphaseRequest) returns (Task);
  rpc CreatePhaseLink(CreatePhaseLinkRequest) returns (Task);
  rpc DeletePhaseLink(DeletePhaseLinkRequest) returns (Task);

  rpc CreateDocument(CreateDocumentRequest) returns (Document);
  rpc GetDocument(DocumentRequest) returns (Document);
  rpc UpdateDocument(UpdateDocumentRequest) returns (Document);
  rpc RenameDocument(RenameDocumentRequest) returns (Document);
  rpc DeleteDocument(DocumentRequest) returns (google.protobuf.Empty);

  rpc GetWorkflow(google.protobuf.Empty) returns (Workflow);
  rpc UpdateWorkflow(UpdateWorkflowRequest) returns (Workflow);
}

message Task {
  string id = 1;                            // uuid
  string name = 2;
  repeated DocumentSummary documents = 3;
  google.protobuf.Timestamp created_at = 4;
  google.protobuf.Timestamp updated_at = 5;
  TaskStatus status = 6;
  int32 priority = 7;                       // 0-3, default 2
  AgentStatus agent_status = 8;
  string current_phase_id = 10;
  repeated TaskPhase phases = 11;
  string revision = 12;
  int32 number = 13;                        // the "#4" the user sees
  repeated Subphase subphases = 14;
  repeated PhaseLink links = 15;
}
message DocumentSummary { string id = 1; string name = 2; string filename = 3; }
message Document {
  string id = 1; string task_id = 2; string name = 3;
  string filename = 4; string content = 5; string revision = 6;
}
message PhaseDefinition {
  string id = 1; string name = 2; string mode = 4;   // "interactive" | "async"
  string document_template = 6; int32 number = 9;
}
message TaskPhase { PhaseDefinition definition = 1; string document_id = 2; }
message Workflow { repeated PhaseDefinition phases = 1; string revision = 2; }
message WorkspaceInfo { string id = 1; string name = 2; string logo_path = 3; }

// A subphase is a checkable unit of work under one phase, with a document of
// its own. `number` is workspace-wide and stable (shown as "S7").
message Subphase {
  int32 number = 1; string phase_id = 2; string document_id = 3;
  string name = 4; bool done = 5;
}
// A per-phase bookmark (PR, dashboard, spec). http/https only.
message PhaseLink {
  int32 number = 1; string phase_id = 2; string url = 3; string title = 4;
}

enum TaskStatus {
  TASK_STATUS_UNSPECIFIED = 0; TASK_STATUS_OPEN = 1;
  TASK_STATUS_FOCUS = 2; TASK_STATUS_DONE = 3; TASK_STATUS_ARCHIVED = 4;
}
enum AgentStatus { AGENT_STATUS_NONE = 0; AGENT_STATUS_WORKING = 1; }

message ListTasksResponse { repeated Task tasks = 1; repeated string errors = 2; }
message TaskRequest { string task_id = 1; }
message CreateTaskRequest { string name = 1; }
message RenameTaskRequest { string task_id = 1; string name = 2; }
message UpdateTaskRequest {
  string id = 1; string revision = 2; string name = 3;
  TaskStatus status = 4; int32 priority = 5; AgentStatus agent_status = 6;
  google.protobuf.FieldMask update_mask = 8;   // which fields to apply
  string current_phase_id = 9;
}
message CreateSubphaseRequest {
  string task_id = 1; string phase_id = 2; string name = 3; string revision = 4;
}
message UpdateSubphaseRequest {
  string task_id = 1; int32 number = 2; bool done = 3; string revision = 4;
}
message CreatePhaseLinkRequest {
  string task_id = 1; string phase_id = 2; string url = 3;
  string title = 4; string revision = 5;
}
message DeletePhaseLinkRequest {
  string task_id = 1; int32 number = 2; string revision = 3;
}
message CreateDocumentRequest { string task_id = 1; string name = 2; }
message DocumentRequest { string task_id = 1; string document_id = 2; }
message RenameDocumentRequest {
  string task_id = 1; string document_id = 2; string name = 3;
}
message UpdateDocumentRequest {
  string task_id = 1; string document_id = 2;
  string content = 3; string revision = 4;
}
message UpdateWorkflowRequest { Workflow workflow = 1; string revision = 2; }
```

### One example: write a phase document

`GetDocument`, edit the content, `UpdateDocument` with the revision you read.

```bash
BASE=http://127.0.0.1:7331/api/worker.v1.WorkspaceService

curl -s $BASE/GetDocument -H 'Content-Type: application/json' \
  -d '{"taskId":"<task-uuid>","documentId":"<doc-uuid>"}'
# → {"id":"…","name":"Goal planning","content":"# Goal\n\n…","revision":"9f2c…"}

curl -s $BASE/UpdateDocument -H 'Content-Type: application/json' \
  -d '{"taskId":"<task-uuid>","documentId":"<doc-uuid>",
       "content":"# Goal\n\n## Outcome\n\nShip the importer.\n",
       "revision":"9f2c…"}'
```

Every other call follows the same shape. `UpdateTask` is the one with a wrinkle:
it is masked, and in JSON a `FieldMask` is a **comma-separated string of
camelCase field names**, not an object. To advance a phase:

```bash
curl -s $BASE/UpdateTask -H 'Content-Type: application/json' \
  -d '{"id":"<task-uuid>","revision":"<task revision>",
       "currentPhaseId":"implement","updateMask":"currentPhaseId"}'
```

Maskable fields are `name`, `status`, `priority`, `agentStatus` and
`currentPhaseId`; the phase id must be one the task already has.

## Revisions

Every read returns a `revision`, and every write must echo the one it was based
on. A mismatch is rejected as a conflict (Connect code `aborted`) — re-read,
re-apply your change to the fresh content, and retry. Never invent or reuse a
revision. Task-level writes (including subphase and link changes) use the task
revision; document writes use the document revision.

## Document content

`UpdateDocument` replaces the *entire* file, so preserve the parts you are not
editing. A document is Markdown body first, machine sections after:

````md
# Title

Body text. Attachments by relative path: ![alt](assets/3f9a….png)

<agent-instructions>
Prompt text for the agent working this phase.
</agent-instructions>
```cadence-comments
{"version": 2, "threads": [ … ]}
```
````

- `<agent-instructions>` — unindented, unfenced, tags on their own lines. The
  text inside is your prompt for this phase.
- `cadence-comments` — the trailing fenced block, valid JSON, `version` 2.
  Threads are `{ "id", "status": "open"|"resolved", "anchor": { "version": 1,
  "start", "end", "quote", "prefix", "suffix" }, "messages": [{ "id", "author",
  "body", "createdAt" }], "createdAt", "updatedAt" }` with unique ids. Anchors
  are offsets into the Markdown-stripped text and are re-resolved by `quote`
  plus context, so editing around a thread is safe but rewriting its quoted
  passage detaches it. To resolve a thread, flip `status` and keep `updatedAt`
  fresh. Corrupt JSON here forces the document into manual repair mode.
- The rich editor round-trips headings, emphasis, links, lists, checklists,
  tables, code fences, rules, images, videos, and `cadence-html` fences
  (rendered as sandboxed HTML embeds — good for showing UI). Other raw HTML,
  footnotes and reference links stay source-only: still editable, just as text.

## Attachments

Outside the RPC service, on the same server:

- `POST /api/tasks/{taskId}/attachments` — raw bytes as the body,
  `Content-Type` set, original name in a url-encoded `X-Filename` header.
  Returns `{"name": "<stored>"}`. 10 MB limit.
- `GET /api/tasks/{taskId}/attachments/{name}` — serves it back.

Reference the returned name from the document: `![alt](name)` for images,
`<video src="name" controls></video>` for video, `[label](name)` otherwise.
Always relative, never absolute — documents must stay portable.

## Phases come from the workflow

Phase definitions live in the workflow, not on the task: a task stores only
`phaseId` + `documentId`, and names, modes and templates resolve live on every
read. So adding a phase via `UpdateWorkflow` materializes a document from its
template in *every* task, and removing one keeps its document as a supporting
document. After changing the workflow, re-read tasks to see what was created.

Do not invent non-uuid ids, reuse ids across objects, or reference document ids
that are not in the task's `documents` list.
