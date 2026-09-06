import {
  $getRoot,
  $getNodeByKey,
  $isTextNode,
  $isElementNode,
  $isLineBreakNode,
  $createRangeSelection,
  $setSelection,
  type LexicalNode,
  type TextNode,
} from "lexical";
import { $isMarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import {
  anchorAt,
  resolveAnchor,
  type Anchor,
  type Thread,
} from "../../documents/codec";

export function projection() {
  let text = "";
  const spans: { key: string; start: number; end: number }[] = [];
  const marks = new Map<string, { start: number; end: number }>();
  function visit(node: LexicalNode, ids: string[] = []) {
    if ($isMarkNode(node)) ids = [...ids, ...node.getIDs()];
    if ($isTextNode(node)) {
      const start = text.length;
      text += node.getTextContent();
      spans.push({ key: node.getKey(), start, end: text.length });
      ids.forEach((id) => {
        const range = marks.get(id);
        marks.set(id, { start: range?.start ?? start, end: text.length });
      });
    } else if ($isLineBreakNode(node)) text += "\n";
    else if ($isElementNode(node)) {
      node.getChildren().forEach((child) => visit(child, ids));
      if (!node.isInline() && node.getType() !== "root")
        text += node.getType() === "tablecell" ? "\t" : "\n";
    }
  }
  visit($getRoot());
  return { text, spans, marks };
}

export function selectRange(start: number, end: number) {
  const { spans } = projection();
  const a = spans.find((s) => s.start <= start && s.end > start),
    b = [...spans].reverse().find((s) => s.start < end && s.end >= end);
  if (!a || !b) return null;
  const selection = $createRangeSelection();
  selection.anchor.set(a.key, start - a.start, "text");
  selection.focus.set(b.key, end - b.start, "text");
  $setSelection(selection);
  return selection;
}

export function restoreMarks(threads: Thread[]) {
  const { text } = projection();
  threads.forEach((thread) => {
    const range = resolveAnchor(text, thread.anchor);
    if (!range) return;
    const selection = selectRange(range.start, range.end);
    if (selection) $wrapSelectionInMarkNode(selection, false, thread.id);
  });
  $setSelection(null);
}

export function captureAnchors(threads: Thread[], previous: Set<string>) {
  const { text, marks } = projection();
  return threads.map((thread) => {
    const range = marks.get(thread.id);
    const anchor: Anchor = range
      ? anchorAt(text, range.start, range.end)
      : previous.has(thread.id)
        ? { ...thread.anchor, detached: true }
        : thread.anchor;
    return { ...thread, anchor };
  });
}

export function anchorRect(
  id: string,
  getElement: (key: string) => HTMLElement | null,
): DOMRect | null {
  const { spans, marks } = projection();
  const mark = marks.get(id);
  if (!mark) return null;
  const span = spans.find((s) => s.end > mark.start && s.start <= mark.start);
  if (!span || !$isTextNode($getNodeByKey<TextNode>(span.key))) return null;
  return getElement(span.key)?.getBoundingClientRect() ?? null;
}
