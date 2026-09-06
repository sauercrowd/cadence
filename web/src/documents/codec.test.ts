import { describe, expect, it } from "vitest";
import {
  anchorAt,
  parseFile,
  resolveAnchor,
  serializeFile,
  type Thread,
} from "./codec";

const thread: Thread = {
  id: "one",
  status: "open",
  anchor: anchorAt("hello world", 0, 5),
  messages: [{ id: "m", author: "You", body: "Why?", createdAt: "today" }],
  createdAt: "today",
  updatedAt: "today",
};
describe("Markdown comment files", () => {
  it("preserves body bytes and replies across saves", () => {
    const body = "# Heading\n\nText.  \n\n";
    const parsed = parseFile(serializeFile(body, [thread]));
    expect(parsed.body).toBe(body);
    expect(parsed.threads).toEqual([thread]);
  });
  it("round-trips agent instructions alongside comments, in either order", () => {
    const body = "# Goal\n\nText.\n";
    const withPrompt = serializeFile(body, [], "Ask focused questions.");
    let parsed = parseFile(withPrompt);
    expect(parsed.body).toBe(body);
    expect(parsed.agentPrompt).toBe("Ask focused questions.");
    const withBoth = serializeFile(body, [thread], "Ask focused questions.");
    parsed = parseFile(withBoth);
    expect(parsed.body).toBe(body);
    expect(parsed.threads).toEqual([thread]);
    expect(parsed.agentPrompt).toBe("Ask focused questions.");
    const commentsFirst = `${body}\`\`\`cadence-comments\n${JSON.stringify({ version: 2, threads: [] })}\n\`\`\`\n<agent-instructions>\nInstructions.\n</agent-instructions>\n`;
    parsed = parseFile(commentsFirst);
    expect(parsed.body).toBe(body);
    expect(parsed.agentPrompt).toBe("Instructions.");
  });
  it("finds agent instructions anywhere in the document, not only trailing", () => {
    const content =
      "# Implementation\n\n<agent-instructions>\n  hello world\n</agent-instructions>\n\n## Changes\n\n## Links\n";
    const parsed = parseFile(content);
    expect(parsed.error).toBeFalsy();
    expect(parsed.agentPrompt).toBe("  hello world");
    expect(parsed.body).toBe("# Implementation\n\n## Changes\n\n## Links\n");
  });
  it("leaves fenced examples alone, including longer and tilde fences", () => {
    for (const fence of ["````", "`````", "~~~"]) {
      const body = `${fence}md\n\`\`\`cadence-comments\n{}\n\`\`\`\n${fence}\n`;
      expect(parseFile(body).body).toBe(body);
      expect(parseFile(body).threads).toEqual([]);
    }
  });
  it("preserves malformed and future metadata for repair", () => {
    for (const content of [
      "\`\`\`cadence-comments\nno json",
      '\`\`\`cadence-comments\n{"version":42,"threads":[]}\n\`\`\`',
    ]) {
      expect(parseFile(content).error).toBeTruthy();
      expect(parseFile(content).original).toBe(content);
    }
  });
  it("accepts longer fences and CRLF without changing body bytes", () => {
    const body = "# Goal\r\n\r\n";
    const json = JSON.stringify({ version: 2, threads: [thread] });
    const parsed = parseFile(
      body + "````cadence-comments\r\n" + json + "\r\n`````\r\n",
    );
    expect(parsed.error).toBeUndefined();
    expect(parsed.body).toBe(body);
    expect(parsed.threads).toEqual([thread]);
  });
  it("preserves nontrailing, duplicate, short-closed and invalid metadata for repair", () => {
    const valid = serializeFile("", [thread]);
    for (const content of [
      valid + "Body after metadata",
      valid + valid,
      "````cadence-comments\n{}\n```",
      '```cadence-comments\n{"version":2,"threads":[{}]}\n```',
    ]) {
      const parsed = parseFile(content);
      expect(parsed.error).toBeTruthy();
      expect(parsed.original).toBe(content);
    }
  });
  it("keeps fence and tag syntax inside comment messages intact", () => {
    const special = {
      ...thread,
      messages: [
        {
          ...thread.messages[0],
          body: "```cadence-comments\n<agent-instructions>\nhello\n</agent-instructions>\n```",
        },
      ],
    };
    expect(parseFile(serializeFile("Body\n", [special])).threads).toEqual([
      special,
    ]);
  });
  it("reattaches unique quotes, disambiguates context, and never guesses", () => {
    expect(resolveAnchor("prefix hello world", thread.anchor)?.start).toBe(7);
    expect(
      resolveAnchor("hello and hello", {
        ...thread.anchor,
        prefix: "",
        suffix: "",
      }),
    ).toBeNull();
    expect(resolveAnchor("hello and hello world", thread.anchor)?.start).toBe(
      10,
    );
    expect(
      resolveAnchor("hello world", { ...thread.anchor, detached: true }),
    ).toBeNull();
  });
});
