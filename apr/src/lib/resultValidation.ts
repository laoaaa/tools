import type { DocumentData, Finding } from "../types";
export function validateFinding(finding: Finding, document: DocumentData): Finding | null {
  const block = document.blocks.find((item) => item.id === finding.blockId);
  if (!block || !finding.sentence || !finding.oldText) return null;
  if (!finding.sentence.includes(finding.oldText)) return null;
  if (!block.text.includes(finding.sentence) && !block.text.includes(finding.oldText)) return null;
  return { ...finding, status: finding.status ?? "unreviewed", sources: finding.sources ?? [] };
}
export function dedupeFindings(findings: Finding[]): Finding[] {
  const map = new Map<string, Finding>();
  for (const finding of findings) {
    const key = finding.blockId + "|" + finding.oldText;
    const previous = map.get(key);
    if (!previous || (previous.confidence === "doubt" && finding.confidence === "high")) map.set(key, finding);
  }
  return [...map.values()];
}
