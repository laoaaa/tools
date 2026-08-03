import DOMPurify from "dompurify";
import mammoth from "mammoth";
import type { BlockKind, DocumentBlock, DocumentData } from "../types";
function classify(element: Element): BlockKind {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "li") return "list";
  if (tag === "table") return "table";
  return "paragraph";
}
export async function parseDocx(file: File): Promise<DocumentData> {
  const arrayBuffer = await file.arrayBuffer();
  const [htmlResult, rawResult] = await Promise.all([mammoth.convertToHtml({ arrayBuffer }), mammoth.extractRawText({ arrayBuffer })]);
  const safeHtml = DOMPurify.sanitize(htmlResult.value, { USE_PROFILES: { html: true } });
  const doc = new DOMParser().parseFromString("<div>" + safeHtml + "</div>", "text/html");
  const elements = Array.from(doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,table"));
  const chapterStack: string[] = [];
  const blocks: DocumentBlock[] = [];
  elements.forEach((element, index) => {
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const kind = classify(element);
    if (kind === "heading") {
      const level = Number(element.tagName.slice(1));
      chapterStack.splice(level - 1); chapterStack[level - 1] = text;
    }
    blocks.push({ id: "block-" + (index + 1), kind, chapterPath: [...chapterStack].filter(Boolean), text, html: element.outerHTML });
  });
  if (!blocks.length && rawResult.value.trim()) {
    rawResult.value.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean).forEach((text, index) => {
      blocks.push({ id: "block-" + (index + 1), kind: "paragraph", chapterPath: [], text });
    });
  }
  return { name: file.name, size: file.size, blocks, rawText: rawResult.value.trim(), html: safeHtml, warnings: htmlResult.messages.map((message) => message.message) };
}
