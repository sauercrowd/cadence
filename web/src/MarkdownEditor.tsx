import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { editorViewCtx } from "@milkdown/kit/core";
import { linkSchema } from "@milkdown/kit/preset/commonmark";
import { useEffect, useRef } from "react";

import type { CommentThread } from "./comments";

const commentIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    <path d="M8 10h8M12 6v8" />
  </svg>
`;

export type MarkdownEditorAPI = {
  selectedText: () => string | undefined;
  selectionRect: () => DOMRect | undefined;
  addComment: (id: string) => void;
  removeComment: (id: string) => void;
};

type MarkdownEditorProps = {
  documentId: string;
  value: string;
  comments: CommentThread[];
  onChange: (markdown: string) => void;
  onReady: (api: MarkdownEditorAPI | undefined) => void;
  onAddComment: () => void;
  onCommentClick: (id: string, rect: DOMRect) => void;
};

export function MarkdownEditor({ documentId, value, comments, onChange, onReady, onAddComment, onCommentClick }: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const onAddCommentRef = useRef(onAddComment);
  const onCommentClickRef = useRef(onCommentClick);
  const commentsRef = useRef(comments);
  const syncCommentsRef = useRef<() => void>(() => undefined);
  onChangeRef.current = onChange;
  onReadyRef.current = onReady;
  onAddCommentRef.current = onAddComment;
  onCommentClickRef.current = onCommentClick;
  commentsRef.current = comments;

  useEffect(() => {
    syncCommentsRef.current();
  }, [comments]);

  useEffect(() => {
    if (!rootRef.current) return;

    let acceptingChanges = false;
    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: value,
      features: {
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.BlockEdit]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Toolbar]: {
          buildToolbar: (builder) => {
            builder.getGroup("function").addItem("comment", {
              icon: commentIcon,
              label: "Comment",
              active: () => false,
              onRun: () => onAddCommentRef.current(),
            });
          },
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, previousMarkdown) => {
        if (acceptingChanges && markdown !== previousMarkdown) {
          onChangeRef.current(markdown);
          requestAnimationFrame(() => syncCommentsRef.current());
        }
      });
    });
    const syncComments = () => {
      const byId = new Map(commentsRef.current.map((thread) => [thread.id, thread]));
      rootRef.current?.querySelectorAll<HTMLAnchorElement>('a[href^="#worker-comment-"]').forEach((link) => {
        const id = link.getAttribute("href")?.replace("#worker-comment-", "");
        const thread = id ? byId.get(id) : undefined;
        if (!thread) return;
        link.dataset.commentBody = thread.body || "Add a comment…";
        link.dataset.commentStatus = thread.status;
        link.setAttribute("aria-label", `${link.textContent ?? "Commented text"}: ${link.dataset.commentBody}`);
      });
    };
    syncCommentsRef.current = syncComments;
    const handleClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#worker-comment-"]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      onCommentClickRef.current(link.hash.replace("#worker-comment-", ""), link.getBoundingClientRect());
    };
    rootRef.current.addEventListener("click", handleClick, true);

    void crepe.create().then(() => {
      acceptingChanges = true;
      syncComments();
      const view = crepe.editor.ctx.get(editorViewCtx);
      const linkType = linkSchema.type(crepe.editor.ctx);
      onReadyRef.current({
        selectedText: () => {
          const { from, to, empty } = view.state.selection;
          if (empty) return undefined;
          return view.state.doc.textBetween(from, to, " ");
        },
        selectionRect: () => {
          const { from, to, empty } = view.state.selection;
          if (empty) return undefined;
          const start = view.coordsAtPos(from);
          const end = view.coordsAtPos(to);
          return new DOMRect(start.left, Math.min(start.top, end.top), Math.max(1, end.right - start.left), Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top));
        },
        addComment: (id) => {
          const { from, to, empty } = view.state.selection;
          if (empty) return;
          view.dispatch(view.state.tr.addMark(from, to, linkType.create({ href: `#worker-comment-${id}` })));
          view.focus();
        },
        removeComment: (id) => {
          const href = `#worker-comment-${id}`;
          const transaction = view.state.tr;
          view.state.doc.descendants((node, position) => {
            for (const mark of node.marks) {
              if (mark.type === linkType && mark.attrs.href === href) {
                transaction.removeMark(position, position + node.nodeSize, mark);
              }
            }
          });
          if (transaction.docChanged) view.dispatch(transaction);
        },
      });
    });

    return () => {
      acceptingChanges = false;
      onReadyRef.current(undefined);
      syncCommentsRef.current = () => undefined;
      rootRef.current?.removeEventListener("click", handleClick, true);
      void crepe.destroy();
    };
  }, [documentId]);

  return <div className="markdown-editor" ref={rootRef} />;
}
