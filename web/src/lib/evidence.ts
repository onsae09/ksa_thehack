/**
 * 초록 근거 문장 찾기 (검색 파이프라인과 연락 예정 교수 조회가 같은 규칙을 쓴다).
 * 문장을 만들어내지 않고 원문에서 고르기만 한다. 부정·가정 문맥은 negation.ts가 거른다.
 */
import { negatedAt } from "./negation";
import type { CheckItem, Evidence, ItemResult, Paper } from "./types";

export function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitAbstractSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter((s) => s.length > 20);
}

/** 초록 원문 문장 중 키워드가 (부정·가정이 아닌 문맥으로) 들어 있는 첫 문장 */
export function findEvidence(item: CheckItem, papers: Paper[], onTopicIds: Set<string>): Evidence | null {
  if (item.keywords_en.length === 0) return null;
  const re = new RegExp(`\\b(${item.keywords_en.map(escapeRe).join("|")})`, "gi");
  for (const p of papers) {
    for (const s of splitAbstractSentences(p.abstract)) {
      re.lastIndex = 0;
      // 한 문장에 키워드가 여러 번 나오면, 부정이 아닌 첫 위치를 쓴다
      for (let m = re.exec(s); m; m = re.exec(s)) {
        if (negatedAt(s, m.index, m.index + m[0].length)) continue;
        return { sentence: s, matched: m[0], paperTitle: p.title, url: p.url, onTopic: onTopicIds.has(p.id) };
      }
    }
  }
  return null;
}

export function itemResults(items: CheckItem[], papers: Paper[], onTopicIds: Set<string>): ItemResult[] {
  return items.map((it) => ({ label: it.label, kind: it.kind, inferred: it.inferred, evidence: findEvidence(it, papers, onTopicIds) }));
}

export function buildWarning(items: ItemResult[]): string | null {
  const ok = items.filter((i) => i.evidence).map((i) => i.label);
  const no = items.filter((i) => !i.evidence).map((i) => i.label);
  if (no.length === 0) return null;
  if (ok.length === 0) return "초록에서 방법·장비 근거를 찾지 못했습니다. 불가능하다는 뜻은 아니며, 논문 본문이나 직접 문의로 확인해야 합니다.";
  return `${ok.join("·")} 근거는 있으나 ${no.join("·")} 근거는 초록에서 찾지 못했습니다.`;
}
