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
import { markdownTransformers, sourceOnlyReason } from "./markdown";
import { EmbedNode, attachmentUrl, embedContext } from "./embeds";
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
        EmbedNode,
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
  it("round-trips images, titled images and iframe embeds", () => {
    const source =
      '![Diagram](assets/abc123.png)\n\n![Alt \\] text](https://example.com/pic.jpg "A title")\n\n<iframe src="https://example.com/embed" title="Demo"></iframe>';
    const one = convert(source),
      two = convert(one.output);
    expect(one.output).toBe(source);
    expect(two.output).toBe(source);
  });
  it("round-trips video previews", () => {
    const source =
      '<video src="assets/clip.mp4" controls></video>\n\n<video src="https://example.com/trailer.mp4" controls title="Trailer"></video>';
    const one = convert(source),
      two = convert(one.output);
    expect(one.output).toBe(source);
    expect(two.output).toBe(source);
  });
  it("round-trips inline HTML iframes with quotes and markup inside", () => {
    const source =
      '<iframe srcdoc="<p>Hello &quot;world&quot; &amp; friends</p>" title="Note"></iframe>';
    const one = convert(source),
      two = convert(one.output);
    expect(one.output).toBe(source);
    expect(two.output).toBe(source);
  });
  it("keeps images and iframes out of source-only mode", () => {
    expect(
      sourceOnlyReason(
        '# Title\n\n![Diagram](assets/abc123.png)\n\n<iframe src="https://example.com/embed"></iframe>\n\n<iframe srcdoc="<p>Hi</p>"></iframe>\n\n<video src="assets/clip.mp4" controls></video>',
      ),
    ).toBeNull();
    expect(sourceOnlyReason("# Title\n\n<audio src=\"clip.mp3\">")).toContain(
      "source mode",
    );
    expect(sourceOnlyReason("# Title\n\n![a](b) trailing")).toContain(
      "source mode",
    );
  });
  it("resolves relative attachment paths against the current task", () => {
    embedContext.taskId = "task-1";
    expect(attachmentUrl("assets/abc123.png")).toBe(
      "/api/tasks/task-1/attachments/assets%2Fabc123.png",
    );
    expect(attachmentUrl("https://example.com/pic.jpg")).toBe(
      "https://example.com/pic.jpg",
    );
  });
});
