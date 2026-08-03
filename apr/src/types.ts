export type Phase = "idle" | "parsing" | "profiling" | "interviewing" | "awaiting_confirmation" | "running" | "reviewing" | "completed" | "error";
export type BlockKind = "heading" | "paragraph" | "list" | "table";
export type DocumentBlock = { id: string; kind: BlockKind; chapterPath: string[]; text: string; html?: string };
export type DocumentData = { name: string; size: number; blocks: DocumentBlock[]; rawText: string; html: string; warnings: string[] };
export type QuestionOption = { label: string; value: string; hint?: string };
export type AgentQuestion = { id: string; prompt: string; rationale?: string; options: QuestionOption[]; allowCustom?: boolean };
export type ProofreadBrief = {
  documentType: string; audience: string; register: string; strictness: "author" | "editorial" | "prepress";
  polishing: "off" | "minimal" | "suggestive"; preserveDialogueVoice: boolean; checks: string[];
  consistencyTargets: string[]; specialInstructions: string[]; scope: { type: "all" | "chapters"; ids?: string[] };
};
export type FindingStatus = "unreviewed" | "accepted" | "ignored" | "needs_review";
export type Finding = {
  id: string; blockId: string; sentence: string; oldText: string; newText: string; type: string; reason: string;
  confidence: "high" | "doubt"; route: "pass" | "web"; status: FindingStatus; sources: string[];
};
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type ProofreadJob = {
  id: string; label: string; kind: "profile" | "index" | "proofread" | "risk" | "supervise";
  status: JobStatus; progress?: number; error?: string; blockIds?: string[];
};
export type Message = { id: string; role: "assistant" | "user" | "system"; content: string; createdAt: number; question?: AgentQuestion; phase?: Phase };
export type ModelConfig = { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number };
export type AgentEnvelope = {
  reply: string; action: "ask" | "propose_brief" | "revise_brief" | "request_start" | "answer";
  questions?: AgentQuestion[]; briefPatch?: Partial<ProofreadBrief>;
  runSpec?: { scope: ProofreadBrief["scope"]; checks: string[] } | null;
};
export type AgentState = {
  phase: Phase; document: DocumentData | null; profile: { summary: string; signals: string[]; entities: string[] } | null;
  brief: ProofreadBrief | null; messages: Message[]; questionsAsked: number; jobs: ProofreadJob[];
  findings: Finding[]; selectedFindingId: string | null; error: string | null; connected: boolean; demoMode: boolean;
};
