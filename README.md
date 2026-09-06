# Cadence

A local workspace for shaping tasks, handing work to external agents, and reviewing the result. Built with React, Lexical, Zod, and Go/Connect.

- Open, Focus, Done, and Archived task states; separate Working or unset agent activity.
- Compact list and phase-board views with search and filters.
- Four configurable phases and supporting documents. Click a phase's name to view it; hover its number for a clock icon and click to make it current. Earlier phases display as done. Documents remain editable, without approval controls. Tasks always reflect the current workflow: editing a phase's name, mode, or template applies live; removing a phase keeps its document as a supporting document.
- Each phase's instructions travel with its document as an `<agent-instructions>` section, not a separate hidden field — editable Markdown in its own tab (Spec / Agent instructions / Source), out of the way of the main document but never hidden, so what an agent was actually told is always inspectable and correctable.
- Passage-anchored comment dots with floating reply/resolve threads.

Cadence stores its data inside the project it is opened for:

```text
.cadence/
├── workspace.json
├── workflow.json
├── tasks/<task-id>/
│   ├── task.json
│   ├── document-name.md
│   └── history/
└── trash/
```

The `.worker` directory name is retained. This is a clean-slate implementation, without legacy schema migration. Task manifests use schema version 1.

Markdown files are the source of truth. Comment anchors/messages and each phase's agent instructions live only in trailing metadata sections, stripped before rendering and shown collapsed in the editor instead:

```md
The annotated text remains ordinary Markdown.

<agent-instructions>
Work with me to define the outcome...
</agent-instructions>

<comments>
{
  "version": 2,
  "threads": []
}
</comments>
```

## Run

Build the frontend and start Cadence in the current directory:

```bash
pnpm install
pnpm build
go run .
```

Then open <http://127.0.0.1:7331>.

Pass another project directory as the final argument when needed:

```bash
go run . ../my-project
```

For frontend development, run these in separate terminals:

```bash
pnpm server
pnpm dev
```

The Vite development server is available at <http://127.0.0.1:5173> and proxies API calls to the Go server.

## Editing and recovery

Each document has three tabs: Spec (the rich editor for the document body), Agent instructions (a plain Markdown editor scoped to just the `<agent-instructions>` section), and Source (the actual file, byte for byte). The rich editor supports headings, emphasis, links, lists/checklists, fenced code, horizontal rules, simple pipe tables, pasted images, and iframe embeds. Pasted images are stored as attachments under the task's `assets/` directory and referenced by relative path. Source mode handles remaining unsupported constructs such as other raw HTML, reference links, and footnotes, and always shows the actual file — including the `<comments>` and `<agent-instructions>` sections — so it also doubles as the way to hand-repair a broken envelope. Rich editing normalizes Markdown formatting; it is not a byte-preserving round trip. Invalid comment metadata opens in source-repair mode without being discarded. Ambiguous or deleted anchors retain their threads for explicit reattachment.

Documents autosave with revision checks and per-document save queues. Pending drafts are cached in browser IndexedDB. External changes are checked on focus and every five seconds; competing edits open a base/local/disk comparison. File replacements retain recovery backups under `history/`; there are no phase-acceptance snapshots or reassessment rules. Handoffs use the current documents.

Prefer handing document ownership between the browser and external sessions. Arbitrary filesystem writers do not share the server's locking protocol: a write between the final revision check and rename can still race. This is a local tool, not an authenticated multi-user service.

## Checks

```bash
pnpm generate
pnpm check
pnpm test
pnpm build
go test ./...
go vet ./...
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests build and serve the production app at port 7351 using an isolated temporary workspace. See [SPEC.md](SPEC.md) for the product direction and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for architecture and implementation notes.
