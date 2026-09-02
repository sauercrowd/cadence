# Worker

A small, local workspace for task-focused Markdown documents and inline review comments.

Worker stores its data inside the project it is opened for:

```text
.worker/
├── tasks/<task-id>/
│   ├── task.json
│   └── document-name.md
└── trash/
```

Markdown files are the source of truth. Comments use ordinary Markdown links around the annotated text and a machine-readable block at the end of the file:

```md
[the annotated text](#worker-comment-<id>)

<comments>
{
  "version": 1,
  "threads": []
}
</comments>
```

## Run

Build the frontend and start Worker in the current directory:

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
pnpm dev:server
pnpm dev
```

The Vite development server is available at <http://127.0.0.1:5173> and proxies API calls to the Go server.

## Checks

```bash
pnpm generate
pnpm check
pnpm build
go test ./...
go vet ./...
```
