import type { DocumentBlock } from "../types";
export type TextChunk = { id: string; text: string; blockIds: string[]; chapterPath: string[] };
export function chunkBlocks(blocks: DocumentBlock[], targetChars = 3200, overlapBlocks = 1): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: DocumentBlock[] = [];
  let currentChars = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push({ id: "chunk-" + (chunks.length + 1), text: current.map((block) => block.text).join("\n"), blockIds: current.map((block) => block.id), chapterPath: current[current.length - 1]?.chapterPath ?? [] });
    const carry = current.slice(Math.max(0, current.length - overlapBlocks));
    current = carry; currentChars = carry.reduce((sum, block) => sum + block.text.length, 0);
  };
  for (const block of blocks) {
    if (current.length && currentChars + block.text.length > targetChars) flush();
    current.push(block); currentChars += block.text.length;
  }
  flush(); return chunks;
}
