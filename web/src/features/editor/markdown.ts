import {
  $convertFromMarkdownString,
  CHECK_LIST,
  TRANSFORMERS,
  type MultilineElementTransformer,
} from "@lexical/markdown";
import {
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
  $isTableNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  TableCellHeaderStates,
} from "@lexical/table";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import type { ElementTransformer } from "@lexical/markdown";

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}
const TABLE: MultilineElementTransformer = {
  type: "multiline-element",
  dependencies: [TableNode, TableRowNode, TableCellNode],
  regExpStart: /^\|.*\|\s*$/,
  replace: () => false,
  handleImportAfterStartMatch: ({ lines, startLineIndex, rootNode }) => {
    if (
      !/^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(
        lines[startLineIndex + 1] || "",
      )
    )
      return null;
    const table = $createTableNode();
    const alignment = cells(lines[startLineIndex + 1]);
    let last = startLineIndex;
    for (
      let i = startLineIndex;
      i < lines.length && /^\|.*\|\s*$/.test(lines[i]);
      i++
    ) {
      last = i;
      if (i === startLineIndex + 1) continue;
      const row = $createTableRowNode();
      for (const [index, value] of cells(lines[i]).entries()) {
        const cell = $createTableCellNode(
          i === startLineIndex
            ? TableCellHeaderStates.ROW
            : TableCellHeaderStates.NO_STATUS,
        );
        const align = alignment[index] || "";
        cell.setFormat(
          align.startsWith(":") && align.endsWith(":")
            ? "center"
            : align.endsWith(":")
              ? "right"
              : "left",
        );
        $convertFromMarkdownString(value, TRANSFORMERS, cell);
        row.append(cell);
      }
      table.append(row);
    }
    rootNode.append(table);
    return [true, last];
  },
  export: (node, children) => {
    if (!$isTableNode(node)) return null;
    const rows = node.getChildren<TableRowNode>();
    const result = rows.map(
      (row) =>
        `| ${row
          .getChildren<TableCellNode>()
          .map((cell) =>
            children(cell)
              .replace(/\n/g, " ")
              .replace(/(?<!\\)\|/g, "\\|"),
          )
          .join(" | ")} |`,
    );
    const first = rows[0];
    if (first)
      result.splice(
        1,
        0,
        `| ${first
          .getChildren<TableCellNode>()
          .map((cell) =>
            cell.getFormatType() === "center"
              ? ":---:"
              : cell.getFormatType() === "right"
                ? "---:"
                : "---",
          )
          .join(" | ")} |`,
      );
    return result.join("\n");
  },
};
const RULE: ElementTransformer = {
  type: "element",
  dependencies: [HorizontalRuleNode],
  regExp: /^(?:---+|\*\*\*+|___+)\s*$/,
  replace: (parent) => {
    parent.replace($createHorizontalRuleNode());
  },
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
};
export const markdownTransformers = [TABLE, RULE, CHECK_LIST, ...TRANSFORMERS];

export function sourceOnlyReason(markdown: string): string | null {
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*~{3,}/.test(line))
      return "Tilde code fences are preserved in source mode.";
    if (/^\s*`{3,}/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (
      /!\[|^\s*<[^>]+>|\[\^[^\]]+\]|^\s*\[[^\]]+\]:|^ {4}\S/.test(line) &&
      !/^\s*[-*+] /.test(line)
    )
      return "This document contains Markdown that is preserved in source mode (HTML, images, references, or indented blocks).";
  }
  return null;
}
