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

This is a clean-slate implementation, without legacy schema migration. Task manifests use schema version 1.

Markdown files are the source of truth. Comment anchors and messages live in a trailing `cadence-comments` code block. Agent instructions use an `<agent-instructions>` section. Cadence separates both from the rendered body:

````md
The annotated text remains ordinary Markdown.

<agent-instructions>
Work with me to define the outcome...
</agent-instructions>

```cadence-comments
{
  "version": 2,
  "threads": []
}
```
````

## Run

Download the archive for your OS and architecture from [GitHub Releases](https://github.com/sauercrowd/workspace/releases), extract it, and run `./cadence` (`cadence.exe` on Windows). The binary includes the frontend and fonts; Node.js, Go, and separate web files are not needed at runtime. Project data is still stored in `.cadence/` inside the selected project.

To build a single binary from source:

```bash
pnpm install --frozen-lockfile
pnpm build:binary
./cadence ../my-project
```

The build command builds the frontend before Go embeds it. Running `go build` alone uses whatever frontend build is already present.

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

Each document has three tabs: Spec (the rich editor for the document body), Agent instructions (a plain Markdown editor scoped to just the `<agent-instructions>` section), and Source (the actual file, byte for byte). The rich editor supports headings, emphasis, links, lists/checklists, fenced code, horizontal rules, simple pipe tables, pasted images, and sandboxed HTML embeds. Use a `cadence-html` fenced code block for live HTML; ordinary `html` fences remain code examples. Edit embed content in Source. Raw iframe tags remain in source mode. Pasted images are stored as attachments under the task's `assets/` directory and referenced by relative path. Source mode handles remaining unsupported constructs such as other raw HTML, reference links, and footnotes, and always shows the actual file — including the `cadence-comments` and `<agent-instructions>` sections — so it also doubles as the way to hand-repair a broken envelope. Rich editing normalizes Markdown formatting; it is not a byte-preserving round trip. Invalid comment metadata opens in source-repair mode without being discarded. Ambiguous or deleted anchors retain their threads for explicit reattachment.

Documents autosave with revision checks and per-document save queues. Pending drafts are cached in browser IndexedDB. External changes are checked on focus and every five seconds; competing edits open a base/local/disk comparison. File replacements retain recovery backups under `history/`; there are no phase-acceptance snapshots or reassessment rules. Handoffs use the current documents.

Prefer handing document ownership between the browser and external sessions. Arbitrary filesystem writers do not share the server's locking protocol: a write between the final revision check and rename can still race. This is a local tool, not an authenticated multi-user service.

## Releases

Push a version tag (for example, `git tag v0.1.0` followed by `git push origin v0.1.0`) to run the GitHub Actions release workflow. It tests the app, builds binaries with the frontend embedded for Linux, macOS, and Windows (amd64 and arm64), and publishes archives plus `checksums.txt` to a GitHub Release. Tags containing a hyphen, such as `v0.1.0-rc.1`, publish as prereleases. Publishing uses the built-in `GITHUB_TOKEN`.

Run the workflow manually on a branch to build downloadable Actions artifacts without publishing a release. To build the same archives locally on Linux, run `bash scripts/release.sh` after installing dependencies; it requires Go, pnpm, tar, zip, and sha256sum and writes to `dist/`.

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
