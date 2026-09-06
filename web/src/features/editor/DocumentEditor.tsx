import { useEffect, useMemo, useRef, useState } from "react";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  defineExtension,
  configExtension,
  type RangeSelection,
  type EditorState,
} from "lexical";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextExtension, $createHeadingNode } from "@lexical/rich-text";
import { HistoryExtension } from "@lexical/history";
import {
  ListExtension,
  CheckListExtension,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import { LinkExtension, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { TableExtension, INSERT_TABLE_COMMAND } from "@lexical/table";
import { CodeNode, $createCodeNode } from "@lexical/code";
import {
  MarkExtension,
  $wrapSelectionInMarkNode,
  $isMarkNode,
  $createMarkNode,
  MarkNode,
} from "@lexical/mark";
import { registerNestedElementResolver } from "@lexical/utils";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { $setBlocksType } from "@lexical/selection";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  registerMarkdownShortcuts,
} from "@lexical/markdown";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListChecks,
  Code,
  Link,
  MessageSquarePlus,
  Table,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  parseFile,
  serializeFile,
  anchorAt,
  type Thread,
} from "../../documents/codec";
import {
  projection,
  restoreMarks,
  captureAnchors,
  anchorRect,
} from "./anchors";
import { markdownTransformers, sourceOnlyReason } from "./markdown";
import { ThreadOverlay } from "./ThreadOverlay";
import { SourceEditor } from "./SourceEditor";

type Props = {
  content: string;
  onChange: (content: string) => void;
  cacheKey?: string;
  showInstructions?: boolean;
};
const editorCache = new Map<string, { content: string; state: EditorState }>();
const theme = {
  paragraph: "editor-paragraph",
  heading: { h1: "editor-h1", h2: "editor-h2", h3: "editor-h3" },
  text: {
    bold: "editor-bold",
    italic: "editor-italic",
    code: "editor-inline-code",
    strikethrough: "editor-strike",
  },
  list: {
    ul: "editor-ul",
    ol: "editor-ol",
    listitem: "editor-li",
    listitemChecked: "editor-checked",
    listitemUnchecked: "editor-unchecked",
  },
  code: "editor-code",
  link: "editor-link",
  table: "editor-table",
  tableCell: "editor-cell",
  tableCellHeader: "editor-cell-header",
  mark: "editor-mark",
  markOverlap: "editor-mark-overlap",
};

export function DocumentEditor({
  content,
  onChange,
  cacheKey,
  showInstructions = true,
}: Props) {
  const parsed = useMemo(() => parseFile(content), []);
  const [mode, setMode] = useState<"spec" | "instructions" | "source">(
    parsed.error || sourceOnlyReason(parsed.body) ? "source" : "spec",
  );
  const latest = useRef(content);
  const [generation, setGeneration] = useState(0);
  const update = (value: string) => {
    latest.current = value;
    onChange(value);
  };
  const go = (next: typeof mode) => {
    setMode(next);
    setGeneration((g) => g + 1);
  };
  const current = parseFile(latest.current);
  const reason = current.error || sourceOnlyReason(current.body);
  return (
    <div className="document-editor">
      <div className="editor-mode">
        <div className="segmented">
          <button
            className={mode === "spec" ? "selected" : ""}
            disabled={!!reason}
            onClick={() => go("spec")}
          >
            Spec
          </button>
          {showInstructions && (
            <button
              className={mode === "instructions" ? "selected" : ""}
              disabled={!!reason}
              onClick={() => go("instructions")}
            >
              Agent instructions
            </button>
          )}
          <button
            className={mode === "source" ? "selected" : ""}
            onClick={() => go("source")}
          >
            Source
          </button>
        </div>
      </div>
      {reason && <div className="notice">{reason}</div>}
      {mode === "source" ? (
        <SourceEditor
          key={`source-${generation}`}
          value={latest.current}
          label={current.error ? "File source for repair" : "Markdown source"}
          onChange={(value) => update(value)}
        />
      ) : mode === "instructions" ? (
        <SourceEditor
          key={`instructions-${generation}`}
          value={current.agentPrompt}
          label="Agent instructions"
          onChange={(value) =>
            update(serializeFile(current.body, current.threads, value))
          }
        />
      ) : (
        <RichEditor
          key={`rich-${generation}`}
          content={latest.current}
          onChange={update}
          cacheKey={cacheKey}
        />
      )}
    </div>
  );
}

function RichEditor({ content, onChange, cacheKey }: Props) {
  const initial = useMemo(() => parseFile(content), []);
  const extension = useMemo(() => {
    const cached = cacheKey ? editorCache.get(cacheKey) : undefined;
    return defineExtension({
      name: "cadence/editor",
      namespace: "cadence",
      theme,
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        LinkExtension,
        MarkExtension,
        configExtension(TableExtension, {
          hasCellMerge: false,
          hasCellBackgroundColor: false,
        }),
      ],
      nodes: [CodeNode, HorizontalRuleNode],
      $initialEditorState:
        cached?.content === content
          ? cached.state.clone()
          : () => {
              $convertFromMarkdownString(initial.body, markdownTransformers);
              restoreMarks(initial.threads);
            },
      onError: (error) => {
        throw error;
      },
    });
  }, []);
  return (
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <EditorSurface
        initial={initial}
        content={content}
        cacheKey={cacheKey}
        onChange={onChange}
      />
    </LexicalExtensionComposer>
  );
}

function EditorSurface({
  initial,
  onChange,
  content,
  cacheKey,
}: Props & { initial: ReturnType<typeof parseFile> }) {
  const [editor] = useLexicalComposerContext();
  const [threads, setThreads] = useState(initial.threads),
    [draft, setDraft] = useState<Thread | null>(null),
    [markers, setMarkers] = useState<
      { id: string; top: number; detached: boolean }[]
    >([]);
  const root = useRef<HTMLDivElement>(null),
    selection = useRef<RangeSelection | null>(null),
    body = useRef(initial.body),
    data = useRef(initial.threads),
    known = useRef(new Set(initial.threads.map((t) => t.id))),
    agentPrompt = useRef(initial.agentPrompt),
    callback = useRef(onChange);
  callback.current = onChange;
  const serialized = useRef(content);
  function save(next: Thread[]) {
    data.current = next;
    setThreads(next);
    serialized.current = serializeFile(body.current, next, agentPrompt.current);
    callback.current(serialized.current);
  }
  function measure() {
    if (!root.current) return;
    const bounds = root.current.getBoundingClientRect();
    editor.getEditorState().read(() => {
      let previous = -30;
      setMarkers(
        data.current.map((t) => {
          const rect = anchorRect(t.id, (key) => editor.getElementByKey(key));
          const top = Math.max(previous + 28, rect ? rect.top - bounds.top : 8);
          previous = top;
          return { id: t.id, top, detached: !rect };
        }),
      );
    });
  }
  useEffect(() => {
    const unregister = editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves, tags }) => {
        editorState.read(() => {
          const selected = $getSelection();
          if ($isRangeSelection(selected))
            selection.current = selected.isCollapsed()
              ? null
              : selected.clone();
          if (!dirtyElements.size && !dirtyLeaves.size) return;
          if (!tags.has("comment"))
            body.current = $convertToMarkdownString(markdownTransformers);
          const next = captureAnchors(data.current, known.current);
          next.forEach((t) => {
            if (!t.anchor.detached) known.current.add(t.id);
          });
          save(next);
        });
        if (cacheKey)
          editorCache.set(cacheKey, {
            content: serialized.current,
            state: editorState.clone(),
          });
        requestAnimationFrame(measure);
      },
    );
    const shortcuts = registerMarkdownShortcuts(editor, markdownTransformers);
    const nestedMarks = registerNestedElementResolver(
      editor,
      MarkNode,
      (node) => $createMarkNode(node.getIDs()),
      (from, to) => from.getIDs().forEach((id) => to.addID(id)),
    );
    return () => {
      if (cacheKey)
        editorCache.set(cacheKey, {
          content: serialized.current,
          state: editor.getEditorState().clone(),
        });
      unregister();
      shortcuts();
      nestedMarks();
    };
  }, [editor]);
  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [threads]);

  const beginComment = () =>
    editor.getEditorState().read(() => {
      const selected = selection.current;
      if (!selected) return;
      const { text, spans } = projection();
      const a = spans.find((s) => s.key === selected.anchor.key),
        b = spans.find((s) => s.key === selected.focus.key);
      if (!a || !b) return;
      const start = Math.min(
          a.start + selected.anchor.offset,
          b.start + selected.focus.offset,
        ),
        end = Math.max(
          a.start + selected.anchor.offset,
          b.start + selected.focus.offset,
        );
      if (start === end) return;
      const now = new Date().toISOString();
      setDraft({
        id: crypto.randomUUID(),
        status: "open",
        anchor: anchorAt(text, start, end),
        messages: [],
        createdAt: now,
        updatedAt: now,
      });
    });
  function reply(thread: Thread, value: string) {
    const now = new Date().toISOString();
    const next = {
      ...thread,
      updatedAt: now,
      messages: [
        ...thread.messages,
        { id: crypto.randomUUID(), author: "You", body: value, createdAt: now },
      ],
    };
    if (draft?.id === thread.id && selection.current) {
      data.current = [...data.current, next];
      known.current.add(next.id);
      editor.update(
        () => {
          const range = selection.current!.clone();
          $setSelection(range);
          $wrapSelectionInMarkNode(range, range.isBackward(), next.id);
        },
        { tag: "comment" },
      );
      setDraft(null);
    } else save(data.current.map((t) => (t.id === next.id ? next : t)));
  }
  function block(kind: "heading" | "code" | "paragraph") {
    editor.update(() => {
      const range = $getSelection();
      if ($isRangeSelection(range))
        $setBlocksType(range, () =>
          kind === "heading"
            ? $createHeadingNode("h2")
            : kind === "code"
              ? $createCodeNode()
              : $createParagraphNode(),
        );
    });
  }
  return (
    <>
      <div className="format-toolbar" role="toolbar" aria-label="Formatting">
        <button
          aria-label="Bold"
          title="Bold · ⌘B"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        >
          <Bold size={15} />
        </button>
        <button
          aria-label="Italic"
          title="Italic · ⌘I"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        >
          <Italic size={15} />
        </button>
        <button
          aria-label="Heading"
          title="Heading"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => block("heading")}
        >
          <Heading2 size={16} />
        </button>
        <i />
        <button
          aria-label="Bullet list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
          }
        >
          <List size={16} />
        </button>
        <button
          aria-label="Checklist"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
          }
        >
          <ListChecks size={16} />
        </button>
        <button
          aria-label="Code block"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => block("code")}
        >
          <Code size={16} />
        </button>
        <button
          aria-label="Insert table"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.dispatchCommand(INSERT_TABLE_COMMAND, {
              columns: "3",
              rows: "3",
              includeHeaders: true,
            })
          }
        >
          <Table size={15} />
        </button>
        <button
          aria-label="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Link URL (https://…)");
            if (url && /^https?:\/\//i.test(url))
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          }}
        >
          <Link size={14} />
        </button>
        <i />
        <button
          aria-label="Add comment"
          title="Select text to comment"
          onMouseDown={(e) => e.preventDefault()}
          onClick={beginComment}
        >
          <MessageSquarePlus size={16} />
        </button>
        <span className="toolbar-spacer" />
        <button
          aria-label="Undo"
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <Undo2 size={14} />
        </button>
        <button
          aria-label="Redo"
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <Redo2 size={14} />
        </button>
      </div>
      <div className="editor-paper" ref={root}>
        <ContentEditable
          className="rich-editor"
          aria-label="Document body"
          spellCheck
        />
        <div className="comment-layer">
          {markers.map((marker) => {
            const thread = threads.find((t) => t.id === marker.id);
            return (
              thread && (
                <ThreadOverlay
                  key={thread.id}
                  thread={thread}
                  detached={marker.detached}
                  top={marker.top}
                  onReply={(value) => reply(thread, value)}
                  onResolve={() =>
                    save(
                      data.current.map((t) =>
                        t.id === thread.id
                          ? {
                              ...t,
                              status: t.status === "open" ? "resolved" : "open",
                              updatedAt: new Date().toISOString(),
                            }
                          : t,
                      ),
                    )
                  }
                  onReattach={() => {
                    if (!selection.current) return;
                    editor.update(
                      () => {
                        $setSelection(selection.current!.clone());
                        const range = $getSelection();
                        if ($isRangeSelection(range))
                          $wrapSelectionInMarkNode(
                            range,
                            range.isBackward(),
                            thread.id,
                          );
                      },
                      { tag: "comment" },
                    );
                  }}
                />
              )
            );
          })}
          {draft && (
            <ThreadOverlay
              key={draft.id}
              thread={draft}
              top={Math.max(
                0,
                (window.getSelection()?.rangeCount
                  ? window.getSelection()!.getRangeAt(0).getBoundingClientRect()
                      .top
                  : 0) - (root.current?.getBoundingClientRect().top || 0),
              )}
              initialOpen
              onReply={(value) => reply(draft, value)}
              onResolve={() => setDraft(null)}
              onDismiss={() => setDraft(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}
