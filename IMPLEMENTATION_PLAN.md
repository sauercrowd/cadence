# Cadence — implementation plan

Technical plan based on the agreed [product spec](SPEC.md), followed by implementation. The sections below record the design and delivery boundaries, not a task-to-PR convention enforced by Cadence.

## Implementation notes

Phase snapshots, reassessment, and completion tracking have been removed. Clicking a phase sets the current phase through a revision-checked metadata update. No Complete/Reopen actions remain. Handoffs include current documents. Async phases show an inline robot icon; other mode labels are omitted on the task page. Earlier phase-completion/snapshot/history/reassessment design sections below are superseded. Ordinary file-save recovery backups and conflict checks remain.

Workflow simplification: phase configuration now contains only title, agent prompt, optional document template, and interactive/async mode, plus an internal ID. Purpose, completion criteria, and separate review prompts have been removed from the model, API, and UI. Workflow settings use a left-hand phase list and selected-phase detail pane. No migration or compatibility layer is required for existing tasks.

The new frontend, Lexical editor, Go workflow model, revision-checked API, comment codec, draft recovery, phase snapshots, and external-session handoff are implemented. Lexical packages are pinned together at 0.50.0; Zod validates file metadata, recovery drafts, and workflow settings. The former Milkdown frontend has been removed. Actual routes use local workspace data rather than a retained fixture prototype.

The user's later clean-slate clarification removes legacy migration requirements: only the new task schema and comment envelope are supported. Unrecognized data is reported without rewriting it. Storage still lives in `.worker`.

Later revision: tasks no longer snapshot the workflow's phase definitions. `TaskPhase` persists only a phase ID and document ID; name, mode, and template are resolved live against the current workflow on every read (`Store.syncPhases`), so editing a shared phase updates every task immediately. A phase removed from the workflow drops out of a task's active list and its document becomes a supporting document; a phase added to the workflow is created for existing tasks on next read. The manual "Apply workflow" action, dialog, and RPC are removed. The per-phase `prompt` field is also removed: each phase's `documentTemplate` instead embeds its instructions in an `<agent-instructions>` section, parsed by the same codec as `<comments>`, but position-independent — `extractTagBlock` finds it anywhere in the document (not only trailing), since instructions read naturally right after the heading. Workflow settings expose one "Template" field per phase instead of separate prompt/template fields. The document editor is a three-tab surface — Spec (rich editor, document body only), Agent instructions (a plain Markdown/CodeMirror editor scoped to just that section), Source (the literal file bytes, always, including `<comments>` and `<agent-instructions>` — it is a raw-file editor, not a body-only view, and is also how a broken envelope gets repaired). A shared `web/src/ui/PropertyMenu.tsx` slash picker replaces the separate implementations in the task header and task filter, and also drives priority/status selection when creating a task; it offers every value directly in one filterable list (no field-then-value category step, since default field values never collide). Task-overview filter chips render only for filters that are actually set.

Later revision: the external-session handoff feature (Copy prompt button, `PromptDialog`, `web/src/features/handoff/`) is removed, along with the "Current phase" text label in the phase header — both were redundant with the phase timeline. Setting the current phase now happens directly in the timeline: each phase's number badge is its own button (separate from the phase-name button, which still navigates); hovering or focusing an eligible badge previews the current-phase styling (filled, purple) and swaps the number/checkmark for a clock icon, and clicking it calls the same revision-checked `UpdateTask`. The current phase's own badge is disabled. The task breadcrumb header (back arrow, "Tasks", task code) is merged into the task heading row — the back button now sits directly left of the priority badge; the task code is no longer shown. The Agent instructions tab is scoped to phase documents only (`DocumentEditor`'s `showInstructions` prop, `false` for supporting documents) — instructions describe a phase's handoff, not arbitrary notes. The sidebar's workflow-settings link moved out of its own "Configuration" section to sit directly under Tasks, and is now labeled "Phases" (route and internal naming unchanged).

Later revision: restore is gone as a concept — archived is just one of the four
task statuses, so leaving it is an ordinary status change through the same `/`
picker. `Task.PreviousStatus`, `Store.RestoreTask`, and the `ArchiveTask` /
`RestoreTask` RPCs (plus `RevisionTaskRequest`) are removed; the frontend already
archived through `UpdateTask`. The task list also merges its Phase and Progress
columns into one "Status" column — progress bubbles first, then the phase name —
and drops the trailing action column, since the row title is already the control
that opens the task. The UI runs on the Ink & Amber token system documented in
AGENTS.md.

Interaction differences from the proposed design: adjacent comment dots are staggered instead of grouped into a picker; unattached threads remain available as dots near the document top; workflow edits survive in-app navigation in memory, while document drafts use IndexedDB. Rich-editor selection is cached per document; undo history is scoped to a mounted editor. Source mode preserves unsupported Markdown. See README for the supported subset and external-writer race limitation.

Verification uses Vitest, temporary-workspace Go tests, and Playwright against the production build. Automated checks are not a substitute for a longer hands-on writing session to judge editor feel.

## Scope and technical decisions

Build a new frontend around four phases: Goal planning, Implementation planning, Implementation, and Finalize work. Keep local operation against one project directory, JSON task metadata, Markdown documents with embedded comments, and external agent sessions.

Keep React, TypeScript, and Vite as the application foundation. Replace the existing application components, editor, styles, navigation, and state management. Keep the Go HTTP server, Connect/protobuf transport, static asset serving, and useful file-store primitives. No database, hosted services, agent runner, project registry, or GitHub integration is needed for this version.

Proposed editor: Lexical with our own UI, a separate Markdown file codec, and custom comment anchoring. Validate it in the first prototype before committing the rest of the app to it; Tiptap remains an alternative if that prototype reveals a material limitation. Markdown remains the persisted source of truth; editor JSON is transient state.

Retain the existing `.worker` directory and internal Go/protobuf namespaces during this build. Product branding is Cadence. Renaming storage and transport identifiers adds no user benefit to the initial workflow.

## What exists and what changes

| Existing code | Finding | Plan |
| --- | --- | --- |
| `web/src/App.tsx` | One component owns task navigation, document loading, save timers, comments, and UI; document requests have no stale-response guard | Replace with feature components and a document-session controller keyed by document |
| `web/src/MarkdownEditor.tsx` | Crepe editor with its own theme; annotations use normal link marks and DOM queries | Replace with a custom editor surface and annotation plugin |
| `web/src/comments.ts` | Version 1 stores a single comment body per thread; trailing metadata is detected with a regex | Replace with a versioned document codec supporting replies, anchoring, validation, and fenced-code examples |
| `internal/workspace/store.go` | JSON manifests and Markdown files; UUIDs, temp-file rename writes, document revision hashes, recoverable deletion | Retain primitives; extend the model, mandatory revision checks, and phase history |
| `api/worker/v1/worker.proto`, `internal/server/handler.go` | Task/document CRUD only | Add task state, workflow, phase actions, metadata revisions, and workspace identity |
| `internal/web/web.go`, `web/vite.config.ts`, `main.go` | Local server, API proxy, bundled frontend, SPA fallback | Retain and verify routes work in development and the built app |
| `internal/workspace/store_test.go` | Lifecycle, name collisions, and stale document saves covered | Extend for the new model and failure cases; introduce frontend and browser verification |

The current document update accepts an empty revision, which bypasses its conflict check. Task metadata updates have no revision check. A process mutex serializes operations within one server, but does not coordinate a separate editor or agent writing files directly. Address these limitations explicitly in the persistence work below.

Baseline checked during planning: `pnpm check` and `go test ./...` pass. This establishes the scaffolding baseline, not validation of the proposed editor or workflow.

## Frontend structure and experience

Use a compact application sidebar for Focus, All tasks, Archived, and Workflow settings. List/board is a view toggle over the same task data. Selecting a task opens its full workspace with a compact phase/document navigator and the document taking most of the width. Back navigation restores list filters and scroll position.

Initial design values to validate in the prototype: approximately 208 px app navigation, 36 px list rows, 13 px interface text, 16 px document text, and a document width around 72 characters. Use a small spacing scale, 1 px separators, restrained rounding, and a neutral light palette with one accent. These are starting values, not constraints that override readability. Theme tokens should make a later dark palette straightforward; both themes are not required for the first prototype.

At narrower widths, collapse app navigation and expose phase/document navigation through a compact selector. Keep the document and comment popovers usable. A visible dot can have a 24 px hit target. Test populated views at 1440, 1024, and 768 px widths and at browser zoom.

Proposed routes:

| Route | View |
| --- | --- |
| `/focus?view=list` or `view=board` | Focused tasks, optional agent activity filter |
| `/tasks?status=open` | Searchable task list; status, priority, and phase filters in query parameters |
| `/archived` | Archived tasks and restore actions |
| `/tasks/:taskId/documents/:documentId` | Task workspace with the selected phase or supporting document |
| `/settings/workflow` | Ordered phase definitions, prompt text, document templates, and completion criteria |

Use a small route adapter over browser navigation for these fixed routes, including popstate handling and direct links. Keep routing separate from selection and document sessions. Store last selected document and scroll/selection state per task; changing routes must not destroy an unsaved document session.

Proposed source layout:

```text
web/src/
  app/                 AppShell, routing, navigation, application providers
  ui/                  buttons, menus, dialogs, fields, badges, shared focus behavior
  styles/              tokens.css, base.css, application layout
  features/
    tasks/             TaskList, TaskBoard, filters, metadata controls
    workspace/         TaskWorkspace, PhaseNavigation, DocumentNavigation
    editor/            DocumentEditor, SourceEditor, toolbar, editor adapter
      comments/        anchor plugin, markers, ThreadOverlay
    workflows/         settings, phase actions, workflow update preview
    handoff/           context selection, prompt preview, copy action
  documents/           file codec, comment schema, anchor resolution, session controller
  data/                typed API adapter and resource cache
  gen/                 generated protobuf code
  test/                fixtures and shared test helpers
```

The API adapter translates protobuf defaults into application types, including `agentStatus: 'working' | null`. UI components should not manipulate transport messages or filesystem paths. A shared resource cache holds fetched task/workflow data; document sessions own drafts and save sequencing separately. No app-wide rerender or editor recreation on every keystroke.

Lists sort by priority, then a stable secondary order such as most recently updated and ID. Focus filters are derived from task status and reported agent activity. The initial board groups focused tasks by phase, with Open and Done at its edges; Archived is separate. Start with explicit phase actions, then add drag-and-drop using those same actions. Keyboard users must have equivalent controls.

## Editor and comments

### Editor selection and prototype gate

Lexical is the first prototype candidate. Its core leaves UI and feature composition to the application, fitting Cadence's custom document surface and overlays. Use its React integration and prefer the current extension APIs where available, as recommended by its documentation. [Lexical overview](https://lexical.dev/), [React integration guidance](https://lexical.dev/docs/react/plugins)

Use the standard text, heading, list, task-list, code-block, link, and table capabilities needed by the spec. Build a small formatting toolbar and selection-based comment action. Provide a source mode, initially using CodeMirror 6 for Markdown text editing, behind the same document-session interface. [CodeMirror documentation](https://codemirror.net/docs/)

Lexical provides Markdown import/export and typing shortcuts through configurable transformers. Start with `@lexical/markdown`, explicitly configuring support for the document features we need, and test the selected package release rather than relying on examples from the repository's development branch. Our comment envelope stays outside Markdown conversion. Do not assume lossless conversion of arbitrary Markdown. [Lexical Markdown documentation](https://lexical.dev/docs/packages/lexical-markdown)

Both Lexical and Tiptap can support a custom UI. Tiptap offers a ProseMirror extension model; its Markdown bridge is documented as beta with limitations around comments and table cell structure. Lexical also requires us to own serialization and comment persistence. The recommendation to prototype Lexical first is a design judgment based on its extensible React integration and mark-based annotation approach, not a claim that it is universally faster or more reliable. [Tiptap styling documentation](https://tiptap.dev/docs/editor/getting-started/style-editor), [Tiptap Markdown documentation](https://tiptap.dev/docs/editor/markdown)

Prototype before expanding the app:

- Write, paste, select, format, undo, and redo realistic specs with headings, nested lists, checklists, code fences, links, tables, Unicode, and long paragraphs.
- Round-trip supported Markdown through rich mode and source mode. Whitespace/formatting normalization may occur after a real rich-text edit, but content and meaning must survive. Opening a document alone must never rewrite it.
- Preserve unsupported syntax in source mode; detect it before allowing a lossy rich-text save. Show the reason and keep the original bytes recoverable.
- Create overlapping comments, reply, resolve, reopen, edit surrounding text, delete the anchor passage, and switch between documents.
- Check composition input, clipboard behavior, focus restoration, overlays near viewport edges, and long-document scrolling in the browser.

If the Markdown bridge fails these checks, replace that adapter or evaluate a Markdown-first editor before proceeding. Do not downgrade the experience or silently drop syntax to make the prototype pass. Record the selected versions and supported Markdown contract after the prototype; pin the tested editor packages together.

### File format

Use a single trailing `<comments>` envelope containing JSON version 2. This illustrative thread shape is the proposed contract:

```json
{
  "version": 2,
  "threads": [
    {
      "id": "thread-uuid",
      "status": "open",
      "anchor": {
        "version": 1,
        "start": 120,
        "end": 143,
        "quote": "The selected text here.",
        "prefix": "preceding context ",
        "suffix": " following context"
      },
      "messages": [
        {
          "id": "message-uuid",
          "author": "You",
          "body": "Should this also apply to archived tasks?",
          "createdAt": "2026-09-05T12:00:00Z"
        }
      ],
      "createdAt": "2026-09-05T12:00:00Z",
      "updatedAt": "2026-09-05T12:00:00Z"
    }
  ]
}
```

Authors are local display labels, not authenticated identities. Resolved threads retain their messages. Do not create an empty persisted thread merely because the comment composer was opened.

The file codec returns Markdown body, validated comment data, and original envelope bytes for recovery. Recognize only an actual trailing envelope outside Markdown code examples; use block parsing/fence awareness, not the existing greedy regex. Invalid or unsupported envelopes disable rich editing and remain available in a raw-file recovery view. Never render their JSON as document content or discard it during ordinary saves. Literal `<comments>` examples within code blocks remain normal document content.

Source mode edits the actual file bytes directly, including the `<comments>` and `<agent-instructions>` sections — it is a raw-file editor, not a body-only view; this is also how a malformed envelope gets repaired. Rich mode is the one that separates body from envelope: it edits only the body and re-attaches the current threads/instructions on save, preserving body bytes if the body itself has not changed. Export/copy-file includes the complete envelope; prompt preview can instead include the body and selected unresolved threads.

### Anchoring and overlays

Persist content anchors in the envelope, not normal Markdown links and not pixel coordinates. Define `start`/`end` as UTF-16 offsets in a versioned plain-text projection of the parsed document. The projection must specify block separators, hard breaks, table-cell separators, and inline text handling, with fixtures so it is stable across editor updates. Include the quoted passage and nearby context to recover after external edits.

Within a Lexical editing session, use mark nodes carrying thread IDs to track annotated text through edits. Lexical provides mark helpers, and its official playground demonstrates their use for comments. Build our own overlay and persistence around those primitives; the playground is a reference implementation, not a ready-made Cadence component. [Lexical mark package](https://lexical.dev/docs/packages/lexical-mark), [official comment example](https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/CommentPlugin/index.tsx)

Convert marked text ranges into the persisted text projection on save, and rebuild marks from resolved anchors on load. Serialize the marked text as ordinary Markdown, keeping thread IDs and messages only in the envelope. Verify split/merged text nodes, overlapping marks, copy/paste, and undo/redo in the prototype. Keep thread records when marks disappear so deleted passages and undo can recover their discussion. Lexical node keys are session details and must not become persisted anchor identities.

On reload or a source edit, verify the stored quote at its offsets. If it no longer matches, search using quote and context; reattach only when the match is unambiguous. Otherwise retain the thread as unattached, accessible from a compact comments menu, with an explicit reattach action. Do not guess between repeated passages. Deleted text should not attach its old discussion to newly inserted unrelated content.

Draw marker dots in an overlay layer positioned from editor coordinates. Reposition on document transactions, scrolling, resize, and font/layout changes. Keep overlapping markers reachable through a grouped marker that opens a thread picker. Highlight the referenced passage while its thread is active.

Use Floating UI for positioning, viewport collision handling, and pointer movement between a marker and its overlay. Hover opens a preview; clicking pins the interactive thread. Escape dismisses and restores focus; Enter/Space opens from a focused marker. Replies stay in the pinned overlay. [Floating UI React documentation](https://floating-ui.com/docs/react), [hover interaction documentation](https://floating-ui.com/docs/usehover)

## Storage model

Extend the file store; no database is needed. New paths are proposed as:

```text
.cadence/
  workspace.json                 schema version and stable workspace ID
  workflow.json                  current default workflow template
  tasks/<task-id>/
    task.json                    metadata, workflow snapshot, phase state
    <phase-id>.md                one current document per phase
    <supporting-document>.md
    history/<snapshot-id>.md     immutable accepted document snapshots
  trash/                        existing recoverable deletion storage
```

A stable workspace ID namespaces browser drafts even when different projects are served at the same localhost address. Only backend code resolves paths. Validate manifest filenames, IDs, and symlink containment before file access; project-local metadata must not redirect writes outside the workspace.

### Task and workflow records

| Record | Fields and behavior |
| --- | --- |
| Task | Schema version, ID, title, priority 0–3, status, nullable agent status, next-action text, current phase ID, document index, timestamps, previous status when archived |
| Workflow definition | Stable phase IDs in order; each has name, purpose, mode, prompt, document template, completion criteria; Implementation also includes review prompts |
| Task workflow snapshot | Copy of the definition used at task creation, with source template revision; later shared edits do not mutate it |
| Phase progress | Phase ID, document ID, completion records, and references to accepted upstream inputs; phase state is distinct from task and agent status |
| Completion record | Immutable snapshot references, document/body revisions, upstream accepted revisions, timestamp, and optional decision note |

Preserve the current task `name` field number in protobuf and map it to title in the app; changing a transport spelling is not necessary. New tasks default to `open`, P2, agent status `null`, and the first phase selected but not completed. Create their four phase documents from the copied templates.

Task status and agent activity remain separate. Marking working, clearing it, moving into focus, archiving, restoring, and marking done are explicit operations. Moving a task out of focus does not cancel an external session. If reported activity remains working, display that fact in its details; Cadence must not claim to have stopped an agent. Clear it only through an explicit user update, including a combined status/activity update if appropriate.

Restore from archived to the recorded previous task status. Archiving does not move files into trash. Keep deletion as a separate existing storage operation; the primary new task action is Archive.

Workflow settings initially edit one default ordered workflow. Support add/remove/reorder/edit of phase definitions, with stable IDs independent of labels. Applying template changes to an existing task requires a preview matched by phase ID. Preserve removed phase documents as supporting documents and preserve historical completions; initialize new phases with new documents. Changes to instructions, order, or criteria mark affected phase results for reassessment.

### Phase completion and reassessment

Use explicit Complete/Accept and Reopen actions. Planning acceptance saves the current document before capturing the agreement. Completion checks structured prerequisites and revision consistency; prose completion criteria are affirmed by the human, not evaluated by Cadence. The last phase completing does not automatically set task status to done.

Completion records capture the phase document and accepted upstream bodies. Compute a body hash excluding the comments envelope, so a comment reply alone does not invalidate the agreement. Use the same envelope grammar on the server and client, checked against shared file fixtures. A later body or instruction change leaves the old snapshot available and marks affected downstream work as needing reassessment. This is phase history information, not an additional task status.

Reopening keeps existing work. Accepting a revised upstream document does not silently validate downstream work again: explicitly revisit and reconfirm affected phases, capturing their new input revisions. Display which inputs changed. Supporting documents included as phase inputs also have their revisions recorded.

Keep multi-file changes recoverable: write immutable documents/snapshots before atomically replacing their referencing manifest. Use unique names, and retain enough operation information to recover or report interrupted migration/workflow updates. Opening a partially completed operation must not silently reset phase progress.

## API and document saving

Continue using the existing Connect service and generated clients. Extend the proto additively and regenerate output with `pnpm generate`; do not hand-edit generated files.

| API area | Proposed operations |
| --- | --- |
| Workspace | `GetWorkspace` returns stable ID, display name, and schema version |
| Tasks | Existing list/create/read equivalents plus `GetTask`, revision-checked `UpdateTask`, `ArchiveTask`, and `RestoreTask` |
| Workflows | `GetWorkflow`, revision-checked `UpdateWorkflow`, and explicit `ApplyWorkflowToTask` with expected task/template revisions |
| Phases | `CompletePhase`, `ReopenPhase`, and reads of completion history/snapshots; completion records include checked document/input revisions |
| Documents | Retain CRUD with mandatory expected revisions for writes; return complete file content, revision, and identity |

Metadata updates carry a field mask so omitted fields differ from an explicit agent-status clear. Encode protobuf agent status using an enum with a no-activity value mapped to `null`; task status uses its own enum. Responses include new opaque revisions. A stale mutation returns the existing conflict error category and lets the client fetch current state without losing its draft.

Each document session stores base revision, base content, current body/comments, editor selection, scroll position, and save state. Debounce edits per document, with one in-flight save per document. If editing continues during a save, retain the newer draft and send it after the response advances the base revision. Responses only update their originating session; a slow load for task A must never replace task B's editor.

Keep recoverable drafts in IndexedDB keyed by workspace/task/document ID, including base revision. Mark server-saved only after acknowledgment of the current draft. Persist pending work before navigation; on reload, compare the recovered base revision with the server and offer recovery or conflict resolution. If browser persistence fails, report that and keep a navigation warning while changes are unsaved. Recovery storage is a fallback, not the canonical workspace.

Refetch on window focus, task/document selection, and explicit Refresh. While the document is visible, poll its revision at a modest interval, proposed five seconds. Clean external changes can load while preserving position where possible; dirty drafts enter a conflict view showing base, local, and disk content. Preserve both versions until the user selects or edits a resolution. Resolved saves still use the latest expected revision.

Require expected revisions on metadata and document writes. Retain per-file atomic writes and server serialization; re-read just before replacement. An arbitrary external writer can still race between the last check and rename, because filesystem editing does not provide a shared compare-and-swap protocol. Keep recoverable overwritten-version snapshots and document this limit. The initial external workflow should hand off document ownership rather than encourage simultaneous edits; a future agent API can coordinate writes more strongly.

## External-session handoff

The phase's Copy prompt action opens a preview assembled from its snapshotted instructions, current task context, accepted upstream documents, selected supporting documents, unresolved comments selected for inclusion, and expected output. For Implementation, include testing and the configured review loop in that same prompt.

Offer document selection rather than copying every supporting file automatically. Include revision labels in the preview, save pending edits before assembly, and rebuild if inputs change. The resulting text must be self-contained for a session without file access; optional relative file references help agents with repository access. Copying does not mark working, complete a phase, or launch anything.

Use an explicit Mark working control and a separate Finished / needs input action that clears reported activity and lets the user record the next action. Both update the task through the revision-checked API. PR links remain ordinary document content with no PR count, merge gate, or repository API dependency.

## Clean-slate schemas

No unversioned task or legacy comment migration is required. New tasks default to open/P2/null and receive phase documents with collision-safe filenames.

Read and write comment envelope version 2 only. Unsupported or malformed envelopes remain intact for source repair; loading never silently converts them.

Unknown schema versions remain intact and produce a visible error. Malformed individual tasks surface an error while valid tasks remain accessible. Existing trash contents stay untouched.

## Delivery sequence and verification

Each step should leave a demonstrable result. These steps can be mapped to commits or PRs during execution as appropriate.

| Step | Deliverable and main files | Verification / exit condition |
| --- | --- | --- |
| 1. Frontend and editor prototype | New shell, tokens, populated task list, one task workspace, Lexical adapter, source mode, comment overlay; fixture data behind a development-only route | Browser walkthrough of density/navigation and the editor gate above; record Markdown limitations and pin the selected packages before expanding |
| 2. Versioned workspace model | Separate model, storage, and workflow/history concerns; update proto/handler and generated clients | Temporary-workspace tests for status/activity independence, archive/restore, revision conflicts, unknown versions, and filename containment |
| 3. Real task workspace | Connect list, board, filters, task metadata, phase navigation, extra documents, and archive restore to the real API | Browser create/focus/archive/restore/reload flow, direct links and back navigation, no inferred agent activity, no task/PR coupling |
| 4. Durable editor and comments | Finish codec, anchoring, per-document sessions, recovery drafts, and conflict view | Codec fixtures; anchor insert/delete/undo/repeated-text cases; browser slow-response switching, failed saves, refresh recovery, external edits, and overlay interactions |
| 5. Workflows and phase history | Workflow settings, snapshot/apply preview, phase acceptance/reopen/history and reassessment | Shared template edits leave active tasks unchanged; revised accepted inputs flag later work; old accepted documents remain readable; comment-only edits do not invalidate body acceptance |
| 6. External handoff and final polish | Prompt preview/copy, activity controls, missing/empty/error states, shortcuts; remove replaced frontend and Milkdown dependencies | Full spec acceptance scenarios in the browser; inspect actual saved files and copied prompt; run implementation review prompts and fix relevant findings before handoff |

Step 1 is a bounded prototype using fixtures. Steps 2–6 replace the scaffolding through working slices; remove the development-only prototype once the real routes cover it. Keep browser checks that protect data and interaction behavior.

Use unit tests for the file codec, anchor resolution, prompt assembly, and document-session races; Go tests for storage and phase invariants; browser automation for actual editing, overlays, navigation, and external-file changes. Use Playwright as the proposed browser harness, with isolated temporary workspaces and screenshots at the target sizes. Check keyboard operation and the production build as well as development mode. [Playwright testing guidance](https://playwright.dev/docs/best-practices)

Repository checks at integration: `pnpm generate`, `pnpm check`, `pnpm build`, `go test ./...`, and `go vet ./...`, plus the new unit/browser commands added during implementation. Verify generated outputs are reproducible and the built Go server serves direct frontend routes. Update the README's development-server command to the existing `pnpm server` script during the implementation documentation pass.

The main remaining uncertainty is editor behavior with real Markdown and comment anchors. The prototype resolves that before the larger workflow is built. All other choices above are concrete implementation defaults that can be refined in this phase without reopening the agreed product scope.
