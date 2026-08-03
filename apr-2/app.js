// app.js — 校对 Agent Demo 核心逻辑
// 纯前端、无构建步骤。依赖 window.mammoth（CDN 引入）。
import {
  SEARCH_PROMPT, GOV_PROMPT, SUPERVISOR_PROMPT, PROFILE_PROMPT,
  INSTRUCTION_COMPILERS, FALLBACK_QUESTIONS, STAGE_MESSAGES,
} from "./prompts.js";

// ----------------------------- 工具函数 -----------------------------

/** djb2 hash，7 位十六进制，仅用于与生产指纹语义对齐（标识"这段文字变没变"），不要求算法一致 */
export function fingerprint(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(7, "0").slice(0, 7);
}

/** 按中文标点分句，标点保留在句尾 */
export function splitSentences(paragraphText) {
  const text = paragraphText.trim();
  if (!text) return [];
  const parts = text.split(/(?<=[。！？；…]|\.{3}|……)/u);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * 段落数组 -> chunk 数组（每个 chunk 是一个完整的 {"p":[...]} 结构）
 * 规则：累积句子达到 targetSize（默认 1000 字）且处于段落边界时收口，
 * 避免把段落从中间切开（触发监督提示词 N1/N2 截断噪声判定）。
 */
export function buildChunks(paragraphs, targetSize = 1000) {
  const chunks = [];
  let current = { p: [] };
  let currentSize = 0;
  let chunkIndex = 0;

  paragraphs.forEach((paraText, pIdx) => {
    const sentences = splitSentences(paraText);
    if (sentences.length === 0) return;
    const fp = fingerprint(paraText + "#" + pIdx);
    const sArr = sentences.map((t, i) => ({ n: i + 1, t, l: [...t].length }));
    const paraSize = sArr.reduce((sum, s) => sum + s.l, 0);

    current.p.push({ c: pIdx + 1, fp, s: sArr });
    currentSize += paraSize;

    if (currentSize >= targetSize) {
      chunks.push(current);
      chunkIndex++;
      current = { p: [] };
      currentSize = 0;
    }
  });
  if (current.p.length > 0) chunks.push(current);
  return chunks.map((c, i) => ({ ...c, chunkId: i + 1 }));
}

/**
 * 模型输出 JSON 容错解析：
 * 1. 剥离 ```json ... ``` 代码块包裹
 * 2. 直接 parse
 * 3. 失败则截取首个 { 到最后一个 } 再 parse
 * 4. 仍失败则返回 { __parseError: true, raw }
 */
export function safeParseJSON(raw) {
  if (raw == null) return { __parseError: true, raw: "" };
  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  try {
    return JSON.parse(text);
  } catch (e) {
    // fallthrough
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    const slice = text.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch (e) {
      // fallthrough
    }
  }

  return { __parseError: true, raw: text };
}

/** "未发现内容导向风险" 等纯文本无错误回复的识别 */
export function isEmptyResult(raw) {
  if (raw == null) return true;
  const t = String(raw).trim();
  if (t === "") return true;
  if (/^未发现内容导向风险[。.]?$/.test(t)) return true;
  return false;
}

// ----------------------------- 稿件抽样与统计 -----------------------------

/** 从段落数组中抽首/中/尾样本，供画像提示词使用 */
export function sampleParagraphs(paragraphs, sampleChars = 400) {
  const joinFrom = (arr, startIdx, limit) => {
    let out = "";
    let i = startIdx;
    while (i < arr.length && out.length < limit) {
      out += arr[i] + "\n";
      i++;
    }
    return out.trim();
  };
  const head = joinFrom(paragraphs, 0, sampleChars);
  const midStart = Math.max(0, Math.floor(paragraphs.length / 2) - 2);
  const mid = joinFrom(paragraphs, midStart, sampleChars);
  const tailStart = Math.max(0, paragraphs.length - 6);
  const tail = joinFrom(paragraphs, tailStart, sampleChars);
  return { head, mid, tail };
}

/** 粗略统计：总字数、段落数、平均句长、对话占比、疑似人名候选（2~4字连续中文，前有姓氏用字的简单启发） */
export function computeStats(paragraphs) {
  const fullText = paragraphs.join("");
  const totalChars = [...fullText].length;
  const paragraphCount = paragraphs.length;

  const allSentences = paragraphs.flatMap(splitSentences);
  const avgSentenceLen = allSentences.length
    ? Math.round(allSentences.reduce((s, x) => s + [...x].length, 0) / allSentences.length)
    : 0;

  const dialogueCount = paragraphs.filter((p) => /["“][^"”]*["”]/.test(p)).length;
  const dialogueRatio = paragraphCount ? +(dialogueCount / paragraphCount).toFixed(2) : 0;

  const nameCandidates = extractNameCandidates(fullText);

  const yearMatches = fullText.match(/(19|20)\d{2}年/g) || [];
  const numberMatches = fullText.match(/[0-9０-９]+/g) || [];
  const yearDensity = totalChars ? +((yearMatches.length / totalChars) * 1000).toFixed(2) : 0;
  const numberDensity = totalChars ? +((numberMatches.length / totalChars) * 1000).toFixed(2) : 0;

  return {
    totalChars, paragraphCount, avgSentenceLen, dialogueRatio,
    nameCandidatesTop: nameCandidates.slice(0, 15),
    yearDensity, numberDensity,
  };
}

const COMMON_SURNAMES = "王李张刘陈杨黄赵周吴徐孙朱马胡郭林何高梁郑罗宋谢唐韩曹许邓萧冯曾程蔡彭潘袁于董余苏叶吕魏蒋田杜丁沈姜范江傅钟卢汪戴崔任陆廖姚方金邱夏谭韦贾邹石熊孟秦阎薛侯雷白龙段郝孔邵史毛常万顾赖武康贺严尹钱施牛洪龚".split("");

/** 极简人名候选提取：常见姓氏 + 1~3 个连续汉字，仅用于统计展示与后续人名聚类，不追求准确率 */
export function extractNameCandidates(text) {
  // 姓氏 + 2个汉字，贪婪匹配；中文连续书写没有天然词边界，不加环视锚点（曾导致名字后接汉字时永远匹配失败）
  const re = new RegExp(`[${COMMON_SURNAMES.join("")}][\\u4e00-\\u9fa5]{2}`, "g");
  const counts = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[0];
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

/**
 * 编辑距离 <=1 且首字相同的人名候选归为一组，仅保留存在 >=2 种写法的组。
 * 用于跨 chunk 人名一致性检查的候选分组，最终判定仍需送一次 LLM。
 */
export function clusterNameVariants(nameCandidates) {
  function editDistanceLE1(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (l.length - s.length === 0) {
      let diff = 0;
      for (let i = 0; i < s.length; i++) if (s[i] !== l[i]) diff++;
      return diff <= 1;
    }
    // length diff 1: check insertion
    let i = 0, j = 0, diff = 0;
    while (i < s.length && j < l.length) {
      if (s[i] === l[j]) { i++; j++; }
      else { diff++; j++; if (diff > 1) return false; }
    }
    return true;
  }

  const groups = [];
  const used = new Set();
  for (let i = 0; i < nameCandidates.length; i++) {
    if (used.has(i)) continue;
    const group = [nameCandidates[i]];
    used.add(i);
    for (let j = i + 1; j < nameCandidates.length; j++) {
      if (used.has(j)) continue;
      if (nameCandidates[i].name[0] === nameCandidates[j].name[0] &&
          editDistanceLE1(nameCandidates[i].name, nameCandidates[j].name)) {
        group.push(nameCandidates[j]);
        used.add(j);
      }
    }
    if (group.length >= 2) groups.push(group);
  }
  return groups;
}

// ----------------------------- LLM 调用 -----------------------------

export class LLMClient {
  constructor({ baseUrl, apiKey, model }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages, { temperature = 0.3, signal } = {}) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        stream: false,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const usage = data.usage || {};
    return { content, usage };
  }

  /** 429/5xx 指数退避重试一次 */
  async chatWithRetry(messages, opts = {}) {
    try {
      return await this.chat(messages, opts);
    } catch (e) {
      if (e.status === 429 || (e.status && e.status >= 500)) {
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
        return await this.chat(messages, opts);
      }
      throw e;
    }
  }
}

// ----------------------------- 并发池 -----------------------------

export async function runPool(items, worker, concurrency = 5, onProgress) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;

  async function runOne() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (e) {
        results[idx] = { error: e.message || String(e) };
      }
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runOne);
  await Promise.all(workers);
  return results;
}

// ----------------------------- 指令编译 -----------------------------

/** 将用户对画像问题的回答编译为追加到三套提示词末尾的定制段文本 */
export function compileInstructions(answers, profile) {
  const lines = [];
  for (const [id, answer] of Object.entries(answers)) {
    const compiler = INSTRUCTION_COMPILERS[id] || INSTRUCTION_COMPILERS.extra;
    const line = compiler(answer, profile || {});
    if (line) lines.push(line);
  }
  if (lines.length === 0) return "";
  return `\n\n# 本轮任务定制（责编确认后生成，优先级高于上方通用规则中与之冲突的部分）\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

export function buildRunPrompts(answers, profile) {
  const customBlock = compileInstructions(answers, profile);
  return {
    searchPrompt: SEARCH_PROMPT + customBlock,
    govPrompt: GOV_PROMPT + customBlock,
    supervisorPrompt: SUPERVISOR_PROMPT, // 监督提示词结构固定，定制通过甲乙输出间接体现，不追加
  };
}

// ----------------------------- 单 chunk 执行 -----------------------------

/**
 * 对单个 chunk 执行：初校A(查全) + 初校B(政务) 并发 -> 监督提示词融合
 * 返回 { chunkId, result: {p, dropped}, usage, raw: {a,b,c} }
 */
export async function processChunk(chunk, { client, searchPrompt, govPrompt, supervisorPrompt }, hooks = {}) {
  const chunkJson = JSON.stringify({ p: chunk.p });

  hooks.onStage?.(chunk.chunkId, "initial");
  const [a, b] = await Promise.all([
    client.chatWithRetry([
      { role: "system", content: searchPrompt },
      { role: "user", content: chunkJson },
    ]),
    client.chatWithRetry([
      { role: "system", content: govPrompt },
      { role: "user", content: chunkJson },
    ]),
  ]);

  hooks.onStage?.(chunk.chunkId, "verify");

  const aOut = isEmptyResult(a.content) ? "未报出错误" : a.content;
  const bOutRaw = isEmptyResult(b.content) ? "未报出错误" : b.content;

  const supervisorUserPrompt = [
    "## 待校对原文（原初校任务的完整输入）",
    chunkJson,
    "",
    "## 校对员甲初校结果",
    aOut,
    "",
    "## 校对员乙初校结果",
    bOutRaw,
    "",
    "## 校对员丙初校结果",
    "未报出错误",
    "",
    "## 开始复核",
    "现在按上述流程复核三份初校结果，直接输出终审 JSON。",
  ].join("\n");

  const c = await client.chatWithRetry([
    { role: "system", content: supervisorPrompt },
    { role: "user", content: supervisorUserPrompt },
  ]);

  const parsed = safeParseJSON(c.content);
  const usage = {
    prompt_tokens: (a.usage.prompt_tokens || 0) + (b.usage.prompt_tokens || 0) + (c.usage.prompt_tokens || 0),
    completion_tokens: (a.usage.completion_tokens || 0) + (b.usage.completion_tokens || 0) + (c.usage.completion_tokens || 0),
  };

  return {
    chunkId: chunk.chunkId,
    result: parsed.__parseError ? { p: [], dropped: [], __parseError: true, __raw: parsed.raw } : parsed,
    usage,
    raw: { a: a.content, b: b.content, c: c.content },
  };
}

// ----------------------------- 结果合并 -----------------------------

export function mergeChunkResults(chunkResults) {
  const merged = { p: [], dropped: [], failedChunks: [] };
  for (const r of chunkResults) {
    if (r.error) {
      merged.failedChunks.push({ chunkId: r.chunkId, error: r.error });
      continue;
    }
    if (r.result?.__parseError) {
      merged.failedChunks.push({ chunkId: r.chunkId, error: "JSON解析失败", raw: r.result.__raw });
      continue;
    }
    if (Array.isArray(r.result?.p)) merged.p.push(...r.result.p.map((x) => ({ ...x, __chunkId: r.chunkId })));
    if (Array.isArray(r.result?.dropped)) merged.dropped.push(...r.result.dropped.map((x) => ({ ...x, __chunkId: r.chunkId })));
  }
  return merged;
}

/** 扁平化为条目数组，供表格渲染/统计/导出使用 */
export function flattenEntries(merged) {
  const rows = [];
  for (const para of merged.p) {
    for (const sent of para.s || []) {
      rows.push({
        chunkId: para.__chunkId,
        c: para.c,
        n: sent.n,
        t: sent.t,
        old: sent.old,
        new: sent.new,
        type: sent.type,
        reason: sent.reason,
        src: sent.src,
        v: sent.v,
        route: sent.route,
      });
    }
  }
  return rows;
}

// ----------------------------- DeepSeek 计价（公开价格常量，仅供演示估算） -----------------------------

export const PRICE_PER_1K = {
  prompt: 0.001, // 元/1K tokens，占位常量，演示前请对照实际账户价格更新
  completion: 0.002,
};

export function estimateCost(usage) {
  const p = (usage.prompt_tokens || 0) / 1000 * PRICE_PER_1K.prompt;
  const c = (usage.completion_tokens || 0) / 1000 * PRICE_PER_1K.completion;
  return +(p + c).toFixed(4);
}

// ----------------------------- docx 解析（浏览器环境，依赖 window.mammoth） -----------------------------

export async function parseDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  const rawText = result.value || "";
  const paragraphs = rawText
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs;
}

export function parsePlainTextFile(text) {
  return text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
