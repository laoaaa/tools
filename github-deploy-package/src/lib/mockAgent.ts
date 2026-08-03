import type { AgentQuestion, Finding, ProofreadBrief, DocumentData } from "../types";
import { CHECK_LABELS } from "../prompts";

export const defaultBrief: ProofreadBrief = {
  documentType: "中文原创书稿",
  audience: "普通大众读者",
  register: "偏口语的非虚构叙述",
  strictness: "editorial",
  polishing: "minimal",
  preserveDialogueVoice: true,
  checks: ["hard", "grammar", "punctuation", "facts", "consistency"],
  consistencyTargets: ["人名", "称谓", "时间线"],
  specialInstructions: [],
  scope: { type: "all" },
};

export const firstQuestion: AgentQuestion = {
  id: "polish-boundary",
  prompt: "这份书稿有明显的口语叙述和人物对话。润色边界希望设在哪里？",
  rationale: "这会直接影响“建议润色”是否进入结果，也避免把作者风格误报为语病。",
  options: [
    { label: "只纠硬错", value: "off", hint: "只报告有明确依据的错误" },
    { label: "允许最小润色", value: "minimal", hint: "保持语气，只改明显不顺" },
    { label: "附带改写建议", value: "suggestive", hint: "将可读性建议单独列出" },
  ],
  allowCustom: true,
};

export const secondQuestion: AgentQuestion = {
  id: "consistency-scope",
  prompt: "书稿里出现较多人物和称谓。是否建立全书一致性索引，专门核对人名、称谓和时间线？",
  rationale: "这些问题通常跨段落发生，单看一个分片容易漏掉前后变化。",
  options: [
    { label: "全部检查", value: "all", hint: "建立全局索引并在分片中回查" },
    { label: "只查人名", value: "names", hint: "优先查实体名称是否前后一致" },
    { label: "本轮不查", value: "none", hint: "先完成基础文字校对" },
  ],
};

export function mockProfile(document: DocumentData) {
  const text = document.rawText;
  const dialogue = /“[^”]{2,}”|「[^」]{2,}」/.test(text);
  const hasPeople = /[一-龥]{2,4}(说道|说|问道|点头|笑了)/.test(text);
  const headings = document.blocks.filter((block) => block.kind === "heading").length;
  return {
    summary: "初步判断这是一份中文原创书稿，" + (dialogue ? "包含较多口语和人物对话，" : "") + "结构上有 " + headings + " 个标题层级。" + (hasPeople ? "文本中出现了可建立一致性索引的人物线索。" : ""),
    signals: [
      dialogue ? "口语/对话较明显" : "语体较为书面",
      headings ? "存在章节或标题结构" : "标题结构不明显",
      hasPeople ? "检测到人物动作与说话动词" : "暂未检测到明显人物线索",
    ],
    entities: hasPeople ? ["人物姓名候选", "人物称谓", "时间线索"] : ["专名与术语候选"],
  };
}

export function mockFindings(document: DocumentData, brief: ProofreadBrief): Finding[] {
  const findings: Finding[] = [];
  document.blocks.forEach((block, index) => {
    const hit = block.text.match(/的的|在在|大弯曲|一方面.*另一方面/);
    if (hit) {
      findings.push({
        id: "finding-" + (index + 1),
        blockId: block.id,
        sentence: block.text,
        oldText: hit[0],
        newText: hit[0] === "的的" ? "的" : hit[0] === "在在" ? "在" : hit[0] === "大弯曲" ? "大湾区" : "建议拆分",
        type: hit[0] === "大弯曲" ? "错字、别字" : "逻辑性、语法性差错",
        reason: "演示用规则命中，建议结合上下文复核。",
        confidence: "high",
        route: "pass",
        status: "unreviewed",
        sources: ["演示校对员甲"],
      });
    }
    if (brief.polishing !== "off" && index % 7 === 0 && block.text.length > 30) {
      findings.push({
        id: "polish-" + (index + 1),
        blockId: block.id,
        sentence: block.text,
        oldText: block.text.slice(0, 5),
        newText: block.text.slice(0, 5),
        type: "建议润色",
        reason: "语句可以更凝练；仅作单独建议，不计入硬错。",
        confidence: "doubt",
        route: "pass",
        status: "unreviewed",
        sources: ["演示校对员乙"],
      });
    }
  });
  return findings;
}

export function formatCheckLabels(checks: string[]) {
  return checks.map((check) => CHECK_LABELS[check] ?? check).join("、");
}
