import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import type { JSX } from "react";
import type { ElementTransformer } from "@lexical/markdown";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

/**
 * One block node for every embed the documents support: pasted images,
 * videos, and iframe embeds. Anything else dropped in becomes a plain
 * attachment link. Everything about one is derived from its single line of
 * Markdown, so the file stays the source of truth.
 */
export type EmbedKind = "image" | "video" | "iframe";

export type SerializedEmbedNode = SerializedLexicalNode & {
  kind: EmbedKind;
  src: string;
  alt: string;
  title: string;
  srcdoc: string;
};

export class EmbedNode extends DecoratorNode<JSX.Element> {
  __kind: EmbedKind;
  __src: string;
  __alt: string;
  __title: string;
  __srcdoc: string;

  static getType() {
    return "embed";
  }
  static clone(node: EmbedNode) {
    return new EmbedNode(
      node.__kind,
      node.__src,
      node.__alt,
      node.__title,
      node.__srcdoc,
      node.__key,
    );
  }
  static importJSON(serialized: SerializedEmbedNode) {
    return $createEmbedNode(
      serialized.kind,
      serialized.src,
      serialized.alt,
      serialized.title,
      serialized.srcdoc ?? "",
    );
  }
  exportJSON(): SerializedEmbedNode {
    return {
      ...super.exportJSON(),
      kind: this.__kind,
      src: this.__src,
      alt: this.__alt,
      title: this.__title,
      srcdoc: this.__srcdoc,
    };
  }

  constructor(
    kind: EmbedKind,
    src: string,
    alt = "",
    title = "",
    srcdoc = "",
    key?: NodeKey,
  ) {
    super(key);
    this.__kind = kind;
    this.__src = src;
    this.__alt = alt;
    this.__title = title;
    this.__srcdoc = srcdoc;
  }
  getKind() {
    return this.getLatest().__kind;
  }
  getSrc() {
    return this.getLatest().__src;
  }
  getAlt() {
    return this.getLatest().__alt;
  }
  getTitle() {
    return this.getLatest().__title;
  }
  getSrcdoc() {
    return this.getLatest().__srcdoc;
  }

  createDOM() {
    return document.createElement("figure");
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return false;
  }

  // DOM round trips only matter for copy/paste inside the editor; the
  // Markdown transformers are the real import/export.
  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (element: HTMLElement) => {
          const img = element as HTMLImageElement;
          const src = img.getAttribute("src");
          if (!src) return null;
          return {
            node: $createEmbedNode(
              "image",
              src,
              img.getAttribute("alt") ?? "",
            ),
          };
        },
        priority: 1,
      }),
    };
  }
  exportDOM(): DOMExportOutput {
    if (this.__kind === "image") {
      const img = document.createElement("img");
      img.setAttribute("src", this.__src);
      img.setAttribute("alt", this.__alt);
      return { element: img };
    }
    const iframe = document.createElement("iframe");
    // An empty src would load the parent page into itself; only set it
    // when the embed actually points at a URL.
    if (this.__src) iframe.setAttribute("src", this.__src);
    if (this.__srcdoc) iframe.setAttribute("srcdoc", this.__srcdoc);
    if (this.__title) iframe.setAttribute("title", this.__title);
    return { element: iframe };
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <EmbedComponent
        kind={this.__kind}
        src={this.__src}
        alt={this.__alt}
        title={this.__title}
        srcdoc={this.__srcdoc}
        nodeKey={this.__key}
      />
    );
  }
}

export function $createEmbedNode(
  kind: EmbedKind,
  src: string,
  alt = "",
  title = "",
  srcdoc = "",
) {
  return new EmbedNode(kind, src, alt, title, srcdoc);
}
export function $isEmbedNode(
  node: LexicalNode | null | undefined,
): node is EmbedNode {
  return node instanceof EmbedNode;
}

function escapeAlt(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\n/g, " ");
}
function unescapeAlt(value: string) {
  return value.replace(/\\([\\\]])/g, "$1");
}

/**
 * `![alt](src)` with an optional `"title"`. Images are first-class citizens
 * of the rich editor; the title rides along on the node so hand-written
 * Markdown round-trips byte for byte.
 */
export const IMAGE: ElementTransformer = {
  type: "element",
  dependencies: [EmbedNode],
  regExp: /^!\[((?:\\.|[^\]])*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/,
  replace: (parent, _children, match) => {
    parent.replace(
      $createEmbedNode("image", match[2], unescapeAlt(match[1]), match[3] ?? ""),
    );
  },
  export: (node) => {
    if (!$isEmbedNode(node) || node.getKind() !== "image") return null;
    const title = node.getTitle();
    return `![${escapeAlt(node.getAlt())}](${node.getSrc()}${title ? ` "${title}"` : ""})`;
  },
};

/** Attribute values in double quotes; `&` first so the two stay inverses. */
function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function unescapeAttr(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/**
 * `<iframe src="…" title="…">` or `<iframe srcdoc="…">` on its own line.
 * Kept as raw HTML in the file so it stays readable and editable in any
 * editor; rendered as a live embed here. The attribute pattern tolerates
 * `>` inside quoted values, which inline HTML is full of.
 */
const IFRAME_ATTRS = `((?:"[^"]*"|'[^']*'|[^>])*)`;
export const IFRAME: ElementTransformer = {
  type: "element",
  dependencies: [EmbedNode],
  regExp: new RegExp(`^<iframe\\s+${IFRAME_ATTRS}>(?:<\\/iframe>)?$`),
  replace: (parent, _children, match) => {
    const src = /\bsrc="([^"]*)"/.exec(match[1])?.[1] ?? "";
    const srcdoc = /\bsrcdoc="([^"]*)"/.exec(match[1])?.[1] ?? "";
    if (!src && !srcdoc) return false;
    const title = /\btitle="([^"]*)"/.exec(match[1])?.[1] ?? "";
    parent.replace(
      $createEmbedNode("iframe", src, "", title, unescapeAttr(srcdoc)),
    );
  },
  export: (node) => {
    if (!$isEmbedNode(node) || node.getKind() !== "iframe") return null;
    const title = node.getTitle();
    const srcdoc = node.getSrcdoc();
    if (srcdoc)
      return `<iframe srcdoc="${escapeAttr(srcdoc)}"${title ? ` title="${title}"` : ""}></iframe>`;
    return `<iframe src="${node.getSrc()}"${title ? ` title="${title}"` : ""}></iframe>`;
  },
};

/**
 * `<video src="…" controls>` on its own line. Dropped video files land as
 * attachments and preview here with native controls.
 */
export const VIDEO: ElementTransformer = {
  type: "element",
  dependencies: [EmbedNode],
  regExp: new RegExp(`^<video\\s+${IFRAME_ATTRS}>(?:<\\/video>)?$`),
  replace: (parent, _children, match) => {
    const src = /\bsrc="([^"]*)"/.exec(match[1])?.[1] ?? "";
    if (!src) return false;
    const title = /\btitle="([^"]*)"/.exec(match[1])?.[1] ?? "";
    parent.replace($createEmbedNode("video", src, "", title));
  },
  export: (node) => {
    if (!$isEmbedNode(node) || node.getKind() !== "video") return null;
    const title = node.getTitle();
    return `<video src="${node.getSrc()}" controls${title ? ` title="${title}"` : ""}></video>`;
  },
};

/**
 * The workspace the editor is showing, used to resolve relative attachment
 * paths. Set once per DocumentEditor.
 */
export const embedContext: { taskId: string } = { taskId: "" };

export function attachmentUrl(src: string): string {
  if (/^(?:https?:|data:|blob:|\/)/i.test(src)) return src;
  return `/api/tasks/${embedContext.taskId}/attachments/${encodeURIComponent(src)}`;
}

// Rendered by Lexical's decorator mechanism. The iframe gets a sandbox and,
// while editing, a click-through shield until the embed is selected: the
// first click selects the embed, the second interacts with the live page.
// Clicks inside the iframe never reach the editor, so editing and
// interacting never fight over them.
function EmbedComponent({
  kind,
  src,
  alt,
  title,
  srcdoc,
  nodeKey,
}: {
  kind: EmbedKind;
  src: string;
  alt: string;
  title: string;
  srcdoc: string;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [selected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  return (
    <span
      className={`embed embed-${kind} ${selected ? "selected" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        clearSelection();
        setSelected(true);
      }}
    >
      {kind === "image" ? (
        <img src={attachmentUrl(src)} alt={alt} title={title} draggable={false} />
      ) : kind === "video" ? (
        <>
          <video
            controls
            preload="metadata"
            src={attachmentUrl(src)}
            title={title || undefined}
          />
          {editor.isEditable() && !selected && (
            <span className="embed-shield" />
          )}
        </>
      ) : (
        <>
          <iframe
            src={src || undefined}
            srcDoc={srcdoc || undefined}
            title={title || "Embedded content"}
            // Inline HTML runs without same-origin so its scripts stay in
            // an opaque origin and cannot reach the app.
            sandbox={
              srcdoc
                ? "allow-scripts allow-popups allow-top-navigation-by-user-activation"
                : "allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
            }
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {editor.isEditable() && !selected && (
            <span className="embed-shield" />
          )}
        </>
      )}
      {(kind === "image" ? alt : title) && (
        <span className="embed-caption">{kind === "image" ? alt : title}</span>
      )}
    </span>
  );
}
