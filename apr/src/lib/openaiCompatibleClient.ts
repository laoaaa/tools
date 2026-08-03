import type { AgentEnvelope, ModelConfig } from "../types";
import { agentEnvelopeSchema, parseJson } from "../schemas";
import { ORCHESTRATOR_PROMPT } from "../prompts";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatOptions = { json?: boolean; signal?: AbortSignal; stream?: boolean; onDelta?: (text: string) => void };

function normaliseBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export class OpenAICompatibleClient {
  constructor(private readonly config: ModelConfig) {}

  async chat(messages: ChatMessage[], options: ChatOptions = {}) {
    const response = await fetch(normaliseBaseUrl(this.config.baseUrl) + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.config.apiKey },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: Boolean(options.stream),
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: options.signal,
    });
    if (!response.ok) throw new Error("模型接口返回 " + response.status + "：" + (await response.text()).slice(0, 240));
    if (options.stream) {
      if (!response.body) throw new Error("模型接口没有返回流式内容");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let content = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());
            const delta = data.choices?.[0]?.delta?.content ?? "";
            if (delta) { content += delta; options.onDelta?.(delta); }
          } catch { /* 忽略 keep-alive 或不完整行 */ }
        }
      }
      return content;
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  async testConnection() {
    await this.chat([{ role: "user", content: "请只回复：连接成功" }], { stream: false });
    return true;
  }

  async nextTurn(messages: ChatMessage[], options: { signal?: AbortSignal } = {}): Promise<AgentEnvelope> {
    const raw = await this.chat(
      [{ role: "system", content: ORCHESTRATOR_PROMPT }, ...messages],
      { json: true, signal: options.signal, stream: false },
    );
    return parseJson(raw, agentEnvelopeSchema) as AgentEnvelope;
  }
}
