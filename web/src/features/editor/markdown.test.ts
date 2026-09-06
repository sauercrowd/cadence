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
import { EmbedNode, attachmentUrl, parseVideo } from "./embeds";
import { $getRoot } from "lexical";
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
    let embeds: string[] = [];
    editor.update(
      () => {
        $convertFromMarkdownString(source, markdownTransformers);
        if (mark) {
          const range = selectRange(0, 5);
          if (range) $wrapSelectionInMarkNode(range, false, "thread");
        }
        embeds = $getRoot()
          .getChildren()
          .filter((node) => node instanceof EmbedNode)
          .map((node) => (node as EmbedNode).getSrcdoc());
        text = projection().text;
        output = $convertToMarkdownString(markdownTransformers);
      },
      { discrete: true },
    );
    return { output, text, embeds };
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
  it("round-trips images and titled images", () => {
    const source =
      '![Diagram](assets/abc123.png)\n\n![Alt \\] text](https://example.com/pic.jpg "A title")';
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
  it("round-trips multiline HTML with quotes, blank lines and nested backticks", () => {
    const html =
      '<style>p { color: navy; }</style>\n\n<p title="hi">Hello &amp; friends</p>\n<script>const x = `value`;</script>\n```\n~~~';
    const source = "````cadence-html\n" + html + "\n````";
    const one = convert(source);
    expect(one.embeds).toEqual([html]);
    expect(one.output).toBe(source);
    expect(convert(one.output).embeds).toEqual([html]);
    expect(sourceOnlyReason(source)).toBeNull();
  });
  it("leaves ordinary HTML fences as code and raw iframes in source mode", () => {
    expect(convert("```html\n<p>Example</p>\n```").embeds).toEqual([]);
    expect(convert("```cadence-html\n<p>Unclosed</p>").embeds).toEqual([]);
    for (const tag of [
      "<iframe src='https://example.com'></iframe>",
      '<iframe srcdoc="<p>Hi</p>"></iframe>',
    ]) {
      expect(sourceOnlyReason(tag)).toContain("source mode");
    }
    expect(
      sourceOnlyReason(
        '![Diagram](assets/a.png)\n\n<video src="assets/a.mp4" controls></video>',
      ),
    ).toBeNull();
  });
  it("parses single, double and unquoted video attributes without losing entities", () => {
    for (const source of [
      `<video src='assets/clip.mp4' title='A &quot;quote&quot; &amp; &#39;apostrophe&#39;'></video>`,
      `<video src = assets/clip.mp4 title="A &quot;quote&quot; &amp; &#x27;apostrophe&#x27;" controls></video>`,
    ]) {
      expect(sourceOnlyReason(source)).toBeNull();
      expect(parseVideo(source)).toEqual({
        src: "assets/clip.mp4",
        title: `A "quote" & 'apostrophe'`,
      });
      const normalized = convert(source).output;
      expect(parseVideo(normalized)).toEqual(parseVideo(source));
      expect(convert(normalized).output).toBe(normalized);
    }
    for (const source of [
      "<video controls></video>",
      "<video data-src='x.mp4'></video>",
      "<video src='x.mp4' poster='x.png'></video>",
      "<video title=\"src='fake.mp4'\"></video>",
    ]) {
      expect(sourceOnlyReason(source)).toContain("source mode");
    }
  });
  it("resolves relative attachment paths against the current task", () => {
    expect(attachmentUrl("assets/abc123.png", "task-1")).toBe(
      "/api/tasks/task-1/attachments/abc123.png",
    );
    expect(attachmentUrl("https://example.com/pic.jpg", "task-1")).toBe(
      "https://example.com/pic.jpg",
    );
  });
});
