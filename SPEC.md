# Cadence — product vision

Agreed phase 1 product direction, based on [PLAN.md](PLAN.md) and subsequent discussion. This document describes the intended experience; details explicitly labeled as proposals remain implementation defaults to validate. Code structure and implementation steps are in the [phase 2 implementation plan](IMPLEMENTATION_PLAN.md).

Confirmed direction: the existing app is scaffolding. The frontend will be designed and built from scratch, including the document editor.

## Goal

Cadence is a workspace for moving multiple tasks through a repeatable human–agent workflow. It should let me spend my attention on defining outcomes and reviewing decisions while agents carry out work that can proceed independently.

Today, each task requires rebuilding the process: explaining the goal, deciding what the agent should do next, finding the relevant context, and checking whether the result matches my intent. Cadence should make that process explicit and reusable.

Success means I can plan one task, leave another in implementation, and review a third without reconstructing the context every time I switch.

## Hypothesis

Work has two dimensions: independent tasks and the phases within each task. Tasks let work happen in parallel. Phases make the agreement between me and the agent explicit.

Each phase has a title, agent prompt, optional document template, and interactive or asynchronous mode. Instructions and expectations belong in the prompt, not separate configuration fields. Each phase has a Markdown document holding its current specification or result.

The document is the durable agreement. Conversations and review comments help refine it, but I should not need to read an entire conversation to understand the current task.

### Default phases

The default workflow has four phases, organized around when I should get involved. Implementation includes testing, agent review, and fixes within the same async phase. Finalize work brings together human review, any applicable merges, and reflection. Use “Implementation planning” for phase 2 to distinguish it from phase 3, “Implementation.”

Interactive means the human will stay fullly focused until the task is completed.
Async means the human will switch away to other tasks. That means enough progress has to happen to not overload the context, but we should spend extra time verifying and validating to make sure when the human comes back as many issues as possible are already resolved.

| Phase | Mode | My role | Agent role | Output and completion |
| --- | --- | --- | --- | --- |
| 1. Goal planning | Interactive | Describe the outcome, answer questions, resolve scope | Explore the idea, surface ambiguities, propose a coherent spec | A goal document with scope, examples, and acceptance criteria that I accept |
| 2. Implementation planning | Interactive | Review tradeoffs and the proposed breakdown | Research the codebase; propose components, data models, tests, and manageable changes | A technical plan and reviewable implementation steps that I accept |
| 3. Implementation | Async | Move on to other work; respond if an essential decision blocks progress | Implement the plan, test, review against configured prompts, fix relevant findings, and repeat as needed | Work ready for human review, with test evidence, review findings and their disposition, deviations, and a concise handoff |
| 4. Finalize work | Interactive, with agent follow-up as needed | Review the output, request changes or approve, decide to merge where applicable, and accept any workflow changes | Explain consequential decisions, respond to feedback, summarize lessons, and propose improvements to future instructions | Accepted output, applicable merges completed, and a brief reflection according to the phase's criteria; I can mark the task done |

### Moving between phases

Proposed default: completing an interactive planning phase requires my explicit acceptance. Once I hand off an accepted implementation plan, the full implementation, testing, and agent review loop proceeds asynchronously within Implementation until the work is ready for my involvement in Finalize work. Internal changes of activity do not require a phase transition or my involvement.

For the initial external-session workflow, this work happens in the agent tool I choose. I record phase completion and transitions in Cadence; Cadence does not launch the next phase automatically. An external agent can carry out implementation and review in one session when instructed to do so.

Async work should record routine decisions and highlight inconsistencies in its final handoff. If proceeding requires changing the agreed outcome or an essential unanswered decision, it should stop that task and describe the decision needed. Other tasks can continue.

Within Implementation, agent review ends when the main agent judges there is no relevant feedback left. The implementation handoff should make that judgment inspectable. Repeated findings without progress should surface as a blocker rather than create an endless loop.

Phases can be revisited. A human review comment may return work to implementation; a fundamental mismatch may return it to goal planning. Earlier results remain available. Revising an accepted document flags dependent later work for reassessment before it is treated as current again.

Within Finalize work, review, applicable merges, and reflection are activities in the same phase. Merge remains an explicit human decision. Reflection can suggest changes to shared prompts, but those changes should be accepted before affecting future tasks. Substantial rework can return to Implementation; completion follows the phase's criteria and my decision to mark the task done.

## Solution

A Linear-style task tracker with a document workspace inside each task. The overview helps me choose where to focus; the task view holds the agreement, work, and review context.

### Frontend direction

Design the frontend around the task and phase workflow described here. Replace the current layout, navigation, styling, components, and editor experience. Existing screens and frontend implementation choices do not constrain the new design; the wireframe below describes information relationships and is also open to redesign.

Confirmed visual direction: similar to Linear — clean, compact, and precise.

Phase viewing and progress are separate: clicking a phase opens its document without changing progress. An explicit Make current action selects the current phase. Show phases as connected timeline bubbles: earlier phases are derived as done, the current phase is filled, and later phases are hollow. Moving backward updates these derived markers; there are no per-phase completion records, snapshots, approval dialogs, or reassessment rules. Documents remain editable; handoffs read current documents. Show an inline robot icon for async phases, with no mode text badges on the task page. This supersedes earlier phase progression and acceptance requirements below; ordinary autosave and conflict protection remain.

Task-page simplification: remove the separate next-action field throughout the product. Task titles, phases, documents, and agent activity provide the context; no additional next-action metadata or list/board summaries are needed. This supersedes earlier next-action references below.

Clarity takes priority over decoration and explanatory clutter. Use factual labels and actionable error/empty-state guidance; avoid slogans, promotional subtitles, and redundant hints. Focused tasks appear directly in the sidebar. A single Tasks entry opens the full collection, with keyboard-accessible filters and list/board views, including archived work through the status filter.

- **Clean:** neutral surfaces, subtle borders, restrained shadows, and color used intentionally for selection, status, and attention. Keep the task and its content visually dominant.
- **Compact:** dense, scannable task rows; narrow navigation; small, consistent controls; and closely grouped metadata. Give documents a comfortable reading width and line spacing while keeping the surrounding interface efficient.
- **Precise:** consistent spacing, aligned columns, crisp typography, a restrained type scale, and consistent icon sizes. Labels should be short and specific; selected, hovered, focused, and disabled states should be unambiguous.

Navigation should make switching between tasks quick while preserving my place in the task I leave. Common actions should be available through keyboard shortcuts and contextual controls, with clear ways to discover them. Visible keyboard focus, readable contrast, usable click targets, and layouts that adapt to smaller windows remain requirements at this density.

The editor should feel integrated into the task workspace, with restrained formatting controls and small comment markers that open overlaid threads. Validate the visual direction using populated task lists, boards, and long phase documents so it holds up during everyday work.

The backend, storage, and API are scaffolding that may be reused where they fit. Their current shape should not determine the product experience. Phase 2 will decide what to retain or replace, including the frontend stack and editor technology.

### Tasks

A task has a title, priority from P0 to P3, task status, agent status, a current phase, and any number of additional Markdown documents. P0 is highest priority; P2 is the proposed default.

Task status describes whether the task is part of my current work:

| Task status | Meaning |
| --- | --- |
| `open` | In the backlog, available to pick up or resume |
| `focus` | In my active set of tasks, whether I or an agent is progressing it |
| `done` | Completed |
| `archived` | Put away and hidden from normal views; documents and history are retained |

Several tasks can be in `focus` at once. Switching the task I am viewing does not change task status. Returning a task to `open` takes it out of my active set while retaining its phase and work. Archiving is a task status; archived tasks can be restored, and their history should retain whether they were previously completed.

Agent status is a separate, minimal field: `working` when an agent is doing work independently, otherwise `null`. Null means no independent agent work is indicated; it does not by itself mean the task requires input. Phase still describes where the task is in the workflow, such as Goal planning or Finalize work.

Together, these fields explain where to put my attention:

- `focus` + `working`: the agent is progressing the task independently; I can turn to another task.
- `focus` + `null`: the task is in my active set and is available for my attention, including interactive work, a decision, review, or starting the next agent run.
- `open`, `done`, and `archived` tasks are outside the current attention queue.

There are no separate “Needs you,” “Ready,” or “Blocked” statuses. A short next-action description provides the context: “Accept implementation plan,” “Decide whether import should overwrite existing records,” or “Waiting for prerequisite task to merge.” A dependency can explain why a focused task cannot progress without adding another status to maintain.

In the initial external-session workflow, I mark agent status as `working` when handing off independent work. When the run finishes or stops for input, I clear it to `null` and record the result or question as the next action. The task remains in `focus` until I change its task status; finishing an agent run does not mean the task itself is done. Agent status is manually reported activity, not live monitoring, and is never inferred from the phase or from copying a prompt.

### Projects and storage

Confirmed initial scope: run locally against one project directory at a time. The directory is the project context; an explicit project registry, project switcher, and cross-project overview can come later.

Keep local file storage for the first version: task metadata in JSON and documents in Markdown inside the project's `.worker/` directory. Phase metadata and workflow settings can extend this model as needed. The existing directory name is an implementation detail, independent of the Cadence branding.

A hosted cloud platform is a possible later direction. The first milestone is a useful local workflow; accounts, cloud sync, hosted storage, and multi-user collaboration are outside the initial scope. Keep filesystem access behind the backend API so a later storage change can be addressed without making local paths part of the frontend's product model. Detailed cloud architecture is deferred.

### Overview: list and board

The list is a compact view of title, priority, task status, current phase, and a working indicator when agent status is `working`. Agent status `null` needs no badge. The list supports search and filtering by these fields. Selecting a task opens its workspace.

Use one free-text Filter input: ordinary text searches task titles and next actions; typing `/` opens a keyboard-controlled picker for priority, status, phase, or agent activity. Selected metadata filters appear as removable chips alongside the text. Do not show separate filter dropdowns or activity tabs. Keep the list/board view picker.

The proposed phase board shows focused tasks grouped by their current phase, with a separate Open backlog for tasks outside the active set. This makes the distinction between planning, independent implementation, and finalization visible. Completed tasks can be shown in a Done column; archived tasks are accessed separately.

A Focus view shows my active tasks across phases. Filtering to agent status `null` brings up the tasks available for my attention; filtering to `working` shows independent agent work. Within those views, prioritize P0 before P1, P2, and P3. Each card includes the specific next action or current activity so opening a task is a deliberate choice.

Moving a card to another phase follows the same completion and reopening rules as the task view; dragging should not silently accept a plan or approve a PR.

### Task workspace

The task header shows title, priority, task status, current phase, agent activity when working, and the next action. Below it, phases appear as an ordered list, visually similar to subtasks. Extra documents appear in a separate section of the same navigation.

Selecting a phase opens its document and a short description of the phase's expectations. The primary action matches the current situation: “Start planning,” “Accept goal,” “Accept plan,” or “Open PR.” Completed phases remain readable and can be reopened.

```text
Tasks / Add CSV export                         P1 · Focus
Implementation planning                      Next: accept plan

Phases                         Phase document
✓ Goal planning                Implementation plan
● Implementation planning      Outcome and agreed scope
○ Implementation               Proposed changes and tradeoffs
○ Finalize work                Steps and verification
                               [Accept plan]

Extra documents
  Export format examples       Comments / decisions
  Research notes               • Marker opens an overlaid thread
  + Add document
```

Markdown documents and discussion attached to specific passages serve the planning and review workflow. Their interaction design will be developed afresh. Accepted decisions should also be incorporated into the document so its current meaning is clear.

Each phase document starts from a template appropriate to that phase. Planning documents capture scope and acceptance criteria; implementation captures progress, test evidence, agent review findings and their disposition, and a handoff; Finalize work captures human feedback, decisions, applicable merge outcomes, and lessons. Additional documents can hold research, examples, or supporting notes without becoming phases.

### Editor experience

The editor is a core product surface and needs a fresh implementation. Choose its technology in phase 2 based on the writing and review experience we want. The current editor library, toolbar, selection behavior, and comment popovers carry no presumption of reuse.

Proposed requirements to validate in an interactive prototype:

- Comfortable writing and reading of long specs, including headings, lists, checklists, links, code blocks, and tables.
- Predictable selection, cursor movement, undo/redo, and paste behavior; formatting and commenting should preserve my place in the document.
- Reliable Markdown import and export, with a clear way to inspect and edit the source.
- Easy creation, navigation, and resolution of comments attached to passages. Edits must not silently attach feedback to unrelated text; comments whose passage is removed should remain discoverable.
- Clear saving, saved, and failure states. Switching tasks or receiving an external document update must not silently lose a draft or overwrite another edit.

Evaluate the design with realistic planning documents and review sessions, including long content and multiple comments. A static mockup alone cannot establish that the editor feels right.

### Comment overlays and storage

Confirmed interaction: comments appear as small position markers, such as dots, beside the passage they refer to. Hovering a marker reveals its thread in a floating overlay; clicking opens it for reading and replying. The overlay sits above the document without changing its layout or reserving a permanent comment column.

Proposed interaction details: hovering keeps the thread visible while the pointer moves into it; clicking keeps it open until dismissed. Markers are keyboard focusable and can be opened with Enter or Space and dismissed with Escape. Their click targets can be larger than the visible dots. Markers follow their passages as text reflows, and nearby markers remain individually accessible.

Comment data lives inside the same Markdown document in a `<comments></comments>` section. Parsing separates this metadata from the document body before Markdown rendering or rich-text editing. The section is hidden from the rendered document, but retained on save and available to agents reading the file. Saving combines the edited body and current comment data back into the same file.

Proposed storage encoding is JSON inside a single trailing section, matching the current scaffolding's general approach:

```md
# Goal

The document content goes here.

<comments>
{
  "version": 2,
  "threads": []
}
</comments>
```

The thread and anchoring schema includes stable thread IDs, passage references, replies, authors, timestamps, and resolution state. Anchors refer to document content rather than screen coordinates. This is a clean-slate implementation; legacy comment formats do not need migration.

The metadata parser must distinguish the trailing section from literal `<comments>` examples inside code blocks. Invalid metadata must be preserved and surfaced as a recoverable error rather than silently discarded on save.

### Reusable workflow and prompts

A workflow settings view shows ordered phases on the left and the selected phase's details on the right. Each phase has only a title, interaction mode, agent prompt, and optional document template. An empty template creates a blank document. Begin with the four defaults above.

The Implementation agent prompt includes review instructions covering maintainability, performance, and security. There is no separate review-prompts field.

Starting a phase should make its handoff context easy to obtain: the task goal, accepted upstream documents, relevant supporting documents, phase instructions, and expected output. Prompt templates should reduce repeated setup while keeping the actual instructions visible and editable.

Proposed default: tasks retain the workflow and prompts they started with. Editing the shared template affects new tasks; applying an update to an existing task is a deliberate action, so active work does not silently change underneath an agent.

### Parallel work and PRs

The overview must work when several tasks occupy different phases at once. A waiting task should not prevent me from planning or reviewing another.

Confirmed direction: a task can have zero or more PRs. Cadence imposes no mapping between tasks, phases, implementation steps, and PRs. The phase instructions and documents define how work is structured, including any PR breakdown, sequencing, review, or merge expectations.

Multiple PRs do not require splitting a task, and completing a task does not require a PR. PR links can be recorded in phase documents as needed. Phase completion follows its defined criteria; creating or merging a PR does not automatically complete a phase or task.

### First usable version

The shared foundation is a new frontend and editor, task metadata, archiving, a list and phase board, phase documents, additional documents, reusable workflow templates, and a visible next action. The tool has never been used; legacy compatibility and migrations are out of scope.

Confirmed initial scope: external agent sessions. Cadence organizes the workflow and prepares prompts and context; I run agents in a separate tool and bring their results back.

The initial handoff flow is:

1. Open a phase and use “Copy prompt” to obtain its instructions, task context, relevant document content, and expected output. The handoff should be inspectable before copying and usable in an external session without access to Cadence's UI.
2. Paste the handoff into my agent tool. For independent work, explicitly mark the task's agent status as `working` in Cadence.
3. Bring the result back into the phase document, including test evidence, review findings, open questions, and PR links where relevant. Clear agent status to `null` when independent work ends, then record completion or continue iterating.

Agents with access to the project directory can also read and edit its Markdown documents directly. Cadence must let me reload external changes and handle conflicts with unsaved edits. A document change alone does not establish that an agent is working or that a phase is complete.

Launching agents, live session monitoring, and automatic phase transitions are deferred. Managed sessions can be added later around the same task, phase, document, and prompt model.

MCP access is a later extension, as in the original plan. Direct GitHub integration is also a proposed later addition; the first version can retain PR links and review summaries while code review happens on GitHub.

### Acceptance scenarios

1. I create a P1 task from a rough idea, refine its goal document through comments, and accept it into implementation planning. The task clearly states what I need to do next.
2. I have three focused tasks in different phases. I have marked one as having an agent working independently; the other two have agent status `null`, with next actions for a scope decision and human review. I can filter to those two without maintaining an additional attention status. When the agent finishes, I clear its working indicator; its task stays focused and joins that view with a result to review.
3. I open an implementation result and find the changes, verification evidence, deviations, and unresolved concerns without reading the agent's full conversation.
4. The task remains in Implementation while the agent builds, tests, reviews, and fixes the work. Agent review repeats after fixes and leaves a concise record of relevant findings and their resolution in the implementation handoff. I return for Finalize work, covering my review, applicable merges, and reflection without separate phase transitions for those activities.
5. Human review uncovers a scope mismatch. I reopen the appropriate planning phase, retain previous results, and can see which later work needs reassessment.
6. I archive and restore a task without losing its documents. I update a shared prompt without silently changing instructions for existing tasks.
7. I write and review a realistic spec in the new editor, use formatting and comments, switch tasks, and return without losing content or my place. The experience is assessed in the browser, including keyboard navigation and save failures.
8. I hover or click a comment marker and read or reply to its thread in an overlay without shifting the document. After saving and reopening, the thread remains attached to its passage; its data is present in the file's `<comments>` section and absent from the rendered body.
9. I copy a phase prompt with its context, use it in an external agent session, and bring the result back into Cadence. I can update agent activity and phase progress explicitly. If the agent edits the document on disk, I can load that result without silently overwriting my own unsaved edits.

10. I complete one task without a PR and another with several PRs, following each task's phase instructions. Cadence imposes neither a PR count nor a requirement to split the task.

## Next: phase 2

Once the product direction is accepted, phase 2 will specify the new frontend architecture and editor approach, assess which backend scaffolding to reuse, define storage and API changes, address existing documents, and divide implementation into reviewable steps with verification criteria. Include an interactive frontend/editor prototype early enough to validate the experience before building the full workflow around it.
