
import { GoogleGenAI, Type } from "@google/genai";
import { ErrorCase, GeneratedArticle } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates real-world error cases based on a theme or user description.
 */
export const generateErrorCases = async (topic: string): Promise<ErrorCase[]> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `请针对主题 "${topic}" 生成 4 个常见的写作错误案例。包含：错别字、语法病句、逻辑矛盾、敏感词或常识性错误。请确保案例真实且有代表性。`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            original: { type: Type.STRING, description: "包含错误的原文" },
            corrected: { type: Type.STRING, description: "修正后的文本" },
            reason: { type: Type.STRING, description: "错误产生的原因及其可能造成的后果" },
            category: { type: Type.STRING, description: "typo, grammar, logic, sensitivity" }
          },
          required: ["id", "original", "corrected", "reason", "category"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Failed to parse error cases JSON", e);
    return [];
  }
};

/**
 * Generates an engaging WeChat article using the identified cases.
 */
export const generateWechatArticle = async (topic: string, cases: ErrorCase[]): Promise<GeneratedArticle> => {
  const casesJson = JSON.stringify(cases);
  const prompt = `
    你是一名顶尖的自媒体主编，擅长撰写点击率破10万+的公众号文章。
    
    任务：基于以下“错误案例”和主题“${topic}”，撰写一篇公众号文章，旨在推广“AI校对王”。
    
    要求：
    1. 标题必须有冲击力，吸引眼球（例如：反直觉、痛点共鸣、悬念感）。
    2. 内容包含：开头引出痛点（低级错误毁掉公信力），中间通过案例对比展示AI校对的专业，最后总结并呼吁行动。
    3. 风格：幽默风趣或深刻犀利。
    4. 包含文章标题、正文和摘要。
    
    案例数据：${casesJson}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING, description: "Markdown格式的正文内容" },
          summary: { type: Type.STRING }
        },
        required: ["title", "content", "summary"]
      }
    }
  });

  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Failed to parse article JSON", e);
    return { title: "生成失败", content: "抱歉，生成文章时出现错误。", summary: "" };
  }
};
