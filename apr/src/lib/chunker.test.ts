import { describe, expect, it } from "vitest";
import { chunkBlocks } from "./chunker";
import { dedupeFindings, validateFinding } from "./resultValidation";
import type { DocumentBlock, DocumentData, Finding } from "../types";

const blocks: DocumentBlock[] = [
  { id: "b1", kind: "paragraph", chapterPath: ["第一章"], text: "甲" },
  { id: "b2", kind: "paragraph", chapterPath: ["第一章"], text: "乙" },
  { id: "b3", kind: "paragraph", chapterPath: ["第一章"], text: "丙" },
];

describe("chunkBlocks", () => {
  it("respects paragraph boundaries and carries overlap", () => {
    const chunks = chunkBlocks(blocks, 2, 1);
    expect(chunks.map((chunk) => chunk.blockIds)).toEqual([["b1", "b2"], ["b2", "b3"]]);
    expect(chunks[1].text).toContain("乙");
  });
});

const document: DocumentData = { name: "test.docx", size: 1, blocks, rawText: "甲\n乙\n丙", html: "", warnings: [] };
const finding = (overrides: Partial<Finding> = {}): Finding => ({
  id: "f1", blockId: "b2", sentence: "乙", oldText: "乙", newText: "已", type: "错字、别字",
  reason: "测试", confidence: "high", route: "pass", status: "unreviewed", sources: [], ...overrides,
});

describe("result validation", () => {
  it("rejects findings whose quoted text is not in the source block", () => {
    expect(validateFinding(finding({ oldText: "不存在" }), document)).toBeNull();
  });
  it("keeps the higher-confidence duplicate", () => {
    const duplicate = finding({ id: "f2", confidence: "doubt" });
    expect(dedupeFindings([duplicate, finding()])).toHaveLength(1);
    expect(dedupeFindings([duplicate, finding()])[0].confidence).toBe("high");
  });
});
