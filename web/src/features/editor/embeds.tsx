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
import { createContext, useContext, type JSX } from "react";
import type {
  ElementTransformer,
  MultilineElementTransformer,
} from "@lexical/markdown";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

/**
 * One block node for every embed the documents support: pasted images,
 * videos, and iframe embeds. Anything else dropped in becomes a plain
 * attachment link. Embed content is stored in Markdown, so the file stays
 * the source of truth.
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
            node: $createEmbedNode("image", src, img.getAttribute("alt") ?? ""),
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
    const element = document.createElement(
      this.__kind === "video" ? "video" : "iframe",
    );
    if (this.__kind === "video") {
      element.setAttribute("src", this.__src);
      element.setAttribute("controls", "");
    } else {
      element.setAttribute("srcdoc", this.__srcdoc);
      element.setAttribute(
        "sandbox",
        "allow-scripts allow-popups allow-top-navigation-by-user-activation",
      );
    }
    if (this.__title) element.setAttribute("title", this.__title);
    return { element };
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
      $createEmbedNode(
        "image",
        match[2],
        unescapeAlt(match[1]),
        match[3] ?? "",
      ),
    );
  },
  export: (node) => {
    if (!$isEmbedNode(node) || node.getKind() !== "image") return null;
    const title = node.getTitle();
    return `![${escapeAlt(node.getAlt())}](${node.getSrc()}${title ? ` "${title}"` : ""})`;
  },
};

/** Explicit HTML fences render in an opaque-origin sandbox. */
export const HTML_EMBED: MultilineElementTransformer = {
  type: "multiline-element",
  dependencies: [EmbedNode],
  regExpStart: /^(`{3,})cadence-html\s*$/,
  replace: () => false,
  handleImportAfterStartMatch: ({
    lines,
    startLineIndex,
    startMatch,
    rootNode,
  }) => {
    const closing = new RegExp("^`{" + startMatch[1].length + ",}\\s*$");
    let end = startLineIndex + 1;
    while (end < lines.length && !closing.test(lines[end])) end++;
    if (end === lines.length) return null;
    rootNode.append(
      $createEmbedNode(
        "iframe",
        "",
        "",
        "",
        lines.slice(startLineIndex + 1, end).join("\n"),
      ),
    );
    return [true, end];
  },
  export: (node) => {
    if (!$isEmbedNode(node) || node.getKind() !== "iframe") return null;
    const html = node.getSrcdoc();
    const longest = Math.max(
      2,
      ...Array.from(html.matchAll(/`+/g), (match) => match[0].length),
    );
    const fence = "`".repeat(longest + 1);
    return `${fence}cadence-html\n${html}\n${fence}`;
  },
};

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
function decodeAttribute(value: string) {
  return value.replace(
    /&(amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,
    (entity, name: string) => {
      const named: Record<string, string> = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
      };
      if (name[0] !== "#") return named[name.toLowerCase()] ?? entity;
      const point =
        name[1].toLowerCase() === "x"
          ? parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : "�";
    },
  );
}

const VIDEO_PATTERN = /^<video\s+((?:"[^"]*"|'[^']*'|[^>])*)>(?:<\/video>)?$/;
// A single parser gates rich mode and creates the node. Unsupported HTML
// remains in source mode rather than silently losing attributes on save.
export function parseVideo(
  line: string,
): { src: string; title: string } | null {
  const match = VIDEO_PATTERN.exec(line);
  if (!match) return null;
  let rest = match[1];
  const attributes = new Map<string, string>();
  while (rest.trim()) {
    const attribute =
      /^\s*([a-z][a-z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?(?=\s|$)/i.exec(
        rest,
      );
    if (!attribute) return null;
    const name = attribute[1].toLowerCase();
    if (!["src", "title", "controls"].includes(name) || attributes.has(name))
      return null;
    attributes.set(
      name,
      decodeAttribute(attribute[2] ?? attribute[3] ?? attribute[4] ?? ""),
    );
    rest = rest.slice(attribute[0].length);
  }
  const src = attributes.get("src");
  return src ? { src, title: attributes.get("title") ?? "" } : null;
}

export const VIDEO: ElementTransformer = {
  type: "element",
  dependencies: [EmbedNode],
  regExp: VIDEO_PATTERN,
  replace: (parent, _children, match) => {
    const parsed = parseVideo(match[0]);
    if (!parsed) return false;
    parent.replace($createEmbedNode("video", parsed.src, "", parsed.title));
  },
  export: (node) => {
    if (!$isEmbedNode(node) || node.getKind() !== "video") return null;
    const title = node.getTitle();
    return `<video src="${escapeAttribute(node.getSrc())}" controls${title ? ` title="${escapeAttribute(title)}"` : ""}></video>`;
  },
};

export const EmbedTaskContext = createContext("");

export function attachmentUrl(src: string, taskId: string): string {
  const name = /^(?:\.\/)?assets\/([^/]+)$/.exec(src)?.[1];
  return name
    ? `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(name)}`
    : src;
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
  const taskId = useContext(EmbedTaskContext);
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
        <img
          src={attachmentUrl(src, taskId)}
          alt={alt}
          title={title}
          draggable={false}
        />
      ) : kind === "video" ? (
        <>
          <video
            controls
            preload="metadata"
            src={attachmentUrl(src, taskId)}
            title={title || undefined}
          />
          {editor.isEditable() && !selected && (
            <span className="embed-shield" />
          )}
        </>
      ) : (
        <>
          <iframe
            srcDoc={srcdoc}
            title={title || "Embedded content"}
            // Inline HTML runs without same-origin so its scripts stay in
            // an opaque origin and cannot reach the app.
            sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation"
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
