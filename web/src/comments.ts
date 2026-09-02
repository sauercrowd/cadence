export type CommentThread = {
  id: string;
  body: string;
  quote: string;
  status: "open" | "resolved";
  createdAt: string;
};

type CommentEnvelope = {
  version: 1;
  threads: CommentThread[];
};

const commentsPattern = /\n*<comments>\s*([\s\S]*)\s*<\/comments>\s*$/;

export function parseDocumentFile(content: string): { markdown: string; comments: CommentThread[] } {
  const match = content.match(commentsPattern);
  if (!match) return { markdown: content, comments: [] };

  try {
    const envelope = JSON.parse(match[1]) as CommentEnvelope;
    if (envelope.version !== 1 || !Array.isArray(envelope.threads)) {
      return { markdown: content, comments: [] };
    }
    return {
      markdown: content.slice(0, match.index).replace(/\s+$/, "") + "\n",
      comments: envelope.threads,
    };
  } catch {
    // Leave malformed metadata visible so opening and saving the file cannot erase it.
    return { markdown: content, comments: [] };
  }
}

export function serializeDocumentFile(markdown: string, threads: CommentThread[]): string {
  const body = markdown.replace(/\s+$/, "") + "\n";
  if (threads.length === 0) return body;

  const envelope: CommentEnvelope = { version: 1, threads };
  return `${body}\n<comments>\n${JSON.stringify(envelope, null, 2)}\n</comments>\n`;
}
