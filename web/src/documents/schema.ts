import { z } from "zod";

export const anchorSchema = z.strictObject({
  version: z.literal(1),
  start: z.int().min(-1),
  end: z.int().min(-1),
  quote: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  detached: z.boolean().optional(),
});
export const messageSchema = z.strictObject({
  id: z.string().min(1),
  author: z.string(),
  body: z.string(),
  createdAt: z.string().min(1),
});
export const threadSchema = z.strictObject({
  id: z.string().min(1),
  status: z.enum(["open", "resolved"]),
  anchor: anchorSchema,
  messages: z.array(messageSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export const commentsSchema = z.strictObject({
  version: z.literal(2),
  threads: z
    .array(threadSchema)
    .refine(
      (threads) => new Set(threads.map((t) => t.id)).size === threads.length,
      "Thread IDs must be unique",
    ),
});
export const draftSchema = z.object({
  content: z.string(),
  baseContent: z.string(),
  revision: z.string(),
  updatedAt: z.number(),
});
export type Anchor = z.infer<typeof anchorSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Thread = z.infer<typeof threadSchema>;
