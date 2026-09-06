import { commentsSchema, type Anchor, type Thread } from "./schema";
export type { Anchor, Message, Thread } from "./schema";
export type DocumentFile = {
  body: string;
  threads: Thread[];
  agentPrompt: string;
  original: string;
  error?: string;
};

// Only an unindented, trailing metadata block is special. Fenced examples remain Markdown.
export function envelopeOffset(content: string): number {
  let offset = 0,
    candidate = -1,
    fence = "",
    length = 0;
  for (const line of content.split(/(?<=\n)/)) {
    const value = line.replace(/\r?\n$/, "");
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(value);
    if (marker) {
      if (!fence && !(marker[1][0] === "`" && marker[2].includes("`"))) {
        fence = marker[1][0];
        length = marker[1].length;
      } else if (
        fence === marker[1][0] &&
        marker[1].length >= length &&
        !marker[2].trim()
      )
        fence = "";
    } else if (candidate < 0 && !fence && value === "<comments>")
      candidate = offset;
    offset += line.length;
  }
  return candidate;
}

// Finds the first unindented, unfenced <tag>...</tag> block anywhere in the
// document (not just trailing), so it can sit wherever it reads naturally —
// typically right after the heading — rather than only at the file's end.
function extractTagBlock(
  content: string,
  tag: string,
): { before: string; inner: string; after: string } | null {
  const openTag = `<${tag}>`,
    closeTag = `</${tag}>`;
  let offset = 0,
    fence = "",
    length = 0,
    blockStart = -1,
    innerStart = -1;
  for (const line of content.split(/(?<=\n)/)) {
    const value = line.replace(/\r?\n$/, "");
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(value);
    if (marker) {
      if (!fence && !(marker[1][0] === "`" && marker[2].includes("`"))) {
        fence = marker[1][0];
        length = marker[1].length;
      } else if (
        fence === marker[1][0] &&
        marker[1].length >= length &&
        !marker[2].trim()
      )
        fence = "";
    } else if (blockStart < 0 && !fence && value === openTag) {
      blockStart = offset;
      innerStart = offset + line.length;
    } else if (blockStart >= 0 && !fence && value === closeTag) {
      const inner = content.slice(innerStart, offset).replace(/\r?\n$/, "");
      let after = offset + line.length;
      const blank = /^\r?\n/.exec(content.slice(after));
      if (blank) after += blank[0].length;
      return {
        before: content.slice(0, blockStart),
        inner,
        after: content.slice(after),
      };
    }
    offset += line.length;
  }
  return null;
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseFile(content: string): DocumentFile {
  const extracted = extractTagBlock(content, "agent-instructions");
  const agentPrompt = extracted?.inner ?? "";
  const withoutPrompt = extracted
    ? extracted.before + extracted.after
    : content;
  const offset = envelopeOffset(withoutPrompt);
  if (offset < 0)
    return { body: withoutPrompt, threads: [], agentPrompt, original: content };
  const body = withoutPrompt.slice(0, offset);
  try {
    const match = /^<comments>\r?\n([\s\S]*?)\r?\n<\/comments>\s*$/.exec(
      withoutPrompt.slice(offset),
    );
    if (!match)
      throw new Error(
        "The comments section is incomplete. Repair it in file source before editing.",
      );
    const data: unknown = JSON.parse(match[1]);
    if (!object(data) || !Array.isArray(data.threads))
      throw new Error("Invalid comments section.");
    if (data.version === 2) {
      const parsed = commentsSchema.safeParse(data);
      if (!parsed.success)
        throw new Error(
          "Invalid comment thread data. Repair the original file source to continue.",
        );
      return { body, threads: parsed.data.threads, agentPrompt, original: content };
    }
    throw new Error(
      "Unsupported comments format. Its contents have been preserved.",
    );
  } catch (error) {
    return {
      body,
      threads: [],
      agentPrompt,
      original: content,
      error:
        error instanceof Error ? error.message : "Invalid comments section.",
    };
  }
}

export function serializeFile(
  body: string,
  threads: Thread[],
  agentPrompt = "",
): string {
  let result = body;
  if (agentPrompt) {
    result = `${result}${result.endsWith("\n") ? "" : "\n"}<agent-instructions>\n${agentPrompt}\n</agent-instructions>\n`;
  }
  if (threads.length) {
    result = `${result}${result.endsWith("\n") ? "" : "\n"}<comments>\n${JSON.stringify({ version: 2, threads }, null, 2)}\n</comments>\n`;
  }
  return result;
}

export function anchorAt(text: string, start: number, end: number): Anchor {
  return {
    version: 1,
    start,
    end,
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - 40), start),
    suffix: text.slice(end, end + 40),
  };
}

export function resolveAnchor(
  text: string,
  anchor: Anchor,
): { start: number; end: number } | null {
  if (anchor.detached || !anchor.quote) return null;
  const matches: { start: number; end: number; score: number }[] = [];
  for (
    let start = text.indexOf(anchor.quote);
    start !== -1;
    start = text.indexOf(anchor.quote, start + 1)
  ) {
    const end = start + anchor.quote.length;
    const score =
      (anchor.prefix &&
      text.slice(Math.max(0, start - anchor.prefix.length), start) ===
        anchor.prefix
        ? 1
        : 0) +
      (anchor.suffix &&
      text.slice(end, end + anchor.suffix.length) === anchor.suffix
        ? 1
        : 0);
    matches.push({ start, end, score });
  }
  matches.sort((a, b) => b.score - a.score);
  if (
    matches.length === 1 ||
    (matches.length > 1 && matches[0].score > matches[1].score)
  )
    return matches[0];
  return null;
}
