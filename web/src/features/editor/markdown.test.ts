import { describe, expect, it } from "vitest";
import { createHeadlessEditor } from "@lexical/headless";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListNode, ListItemNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { TableNode, TableRowNode, TableCellNode } from "@lexical/table";
import { MarkNode, $wrapSelectionInMarkNode } from "@lexical/mark";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { markdownTransformers } from "./markdown";
import { projection, selectRange } from "./anchors";

describe("Lexical Markdown adapter", () => {
  function convert(source: string, mark = false) {
    const editor = createHeadlessEditor({
      nodes: [
        HeadingNode,
        QuoteNode,
        ListNode,
        ListItemNode,
        CodeNode,
        LinkNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        MarkNode,
        HorizontalRuleNode,
      ],
      onError: (error) => {
        throw error;
      },
    });
    let output = "",
      text = "";
    editor.update(
      () => {
        $convertFromMarkdownString(source, markdownTransformers);
        if (mark) {
          const range = selectRange(0, 5);
          if (range) $wrapSelectionInMarkNode(range, false, "thread");
        }
        text = projection().text;
        output = $convertToMarkdownString(markdownTransformers);
      },
      { discrete: true },
    );
    return { output, text };
  }
  it("round-trips headings, inline formats, lists, checklists and code", () => {
    const source =
      '# Heading\n\n**Bold** and *italic* and [link](https://example.com).\n\n- [x] Ready\n- [ ] Next\n\n```ts\nconst value = "😀";\n```';
    const one = convert(source),
      two = convert(one.output);
    expect(two.text).toBe(one.text);
    expect(one.output).toContain("[x] Ready");
    expect(one.output).toContain('const value = "😀";');
  });
  it("preserves tables and alignment", () => {
    const one = convert(
      "| Name | Mode |\n| :--- | ---: |\n| **Plan** | Async |",
    );
    expect(one.output).toContain("**Plan**");
    expect(one.output).toContain("---:");
    expect(convert(one.output).text).toBe(one.text);
  });
  it("serializes comment marks as ordinary text", () => {
    expect(convert("Hello world", true).output).toBe("Hello world");
  });
});
