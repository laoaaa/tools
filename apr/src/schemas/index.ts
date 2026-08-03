import { z } from "zod";
const questionOptionSchema = z.object({ label: z.string(), value: z.string(), hint: z.string().optional() });
export const questionSchema = z.object({ id: z.string(), prompt: z.string(), rationale: z.string().optional(), options: z.array(questionOptionSchema).default([]), allowCustom: z.boolean().optional() });
export const agentEnvelopeSchema = z.object({
  reply: z.string(), action: z.enum(["ask", "propose_brief", "revise_brief", "request_start", "answer"]),
  questions: z.array(questionSchema).optional(), briefPatch: z.record(z.string(), z.unknown()).optional(),
  runSpec: z.object({ scope: z.object({ type: z.enum(["all", "chapters"]), ids: z.array(z.string()).optional() }), checks: z.array(z.string()) }).nullable().optional(),
});
export const findingSchema = z.object({
  id: z.string(), blockId: z.string(), sentence: z.string(), oldText: z.string(), newText: z.string(),
  type: z.string(), reason: z.string(), confidence: z.enum(["high", "doubt"]), route: z.enum(["pass", "web"]),
  status: z.enum(["unreviewed", "accepted", "ignored", "needs_review"]).default("unreviewed"),
  sources: z.array(z.string()).default([]),
});
export function parseJson<T>(value: string, schema: z.ZodType<T>): T {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return schema.parse(JSON.parse(cleaned));
}
