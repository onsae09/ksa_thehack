import { collectDbpia, dbpiaAuthorUrl, fetchAuthorInfo, fetchFullAbstract, type DbpiaPaper } from "./dbpia";
import { similarities } from "./embed";
import { isKoreanName } from "./names";
import { axisScore, fitLabel, round3, W_METHOD, W_TOPIC } from "./scoring";
import type { CheckItem, DomesticCandidate, Evidence, ItemResult, Normalized, SearchResult } from "./types";

const TOP_N = 3;
const NEGATION_KO = /(없|않|못|불가|대신)/;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 한국어 초록: 문장 단위로 키워드(한·영) 포함 문장을 원문 그대로 고른다 */
function findEvidenceKo(item: CheckItem, papers: DbpiaPaper[]): Evidence | null {
  const terms = [...item.keywords_ko, ...item.keywords_en];
  if (terms.length === 0) return null;
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "i");
  for (const p of papers) {
    for (const s of p.abstract.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 15)) {
      const m = re.exec(s);
      if (!m) continue;
      // "실험을 하지 않고" 같은 부정: 키워드 뒤 10자 안에 부정어가 있으면 제외
      if (NEGATION_KO.test(s.slice(m.index + m[0].length, m.index + m[0].length + 10))) continue;
      return { sentence: s, matched: m[0], paperTitle: p.title, url: p.url, onTopic: true };
    }
  }
  return null;
}

function buildWarning(items: ItemResult[]): string | null {
  const ok = items.filter((i) => i.evidence).map((i) => i.label);
  const no = items.filter((i) => !i.evidence).map((i) => i.label);
  if (no.length === 0) return null;
  if (ok.length === 0) return "초록에서 방법·장비 근거를 찾지 못했습니다. 불가능하다는 뜻은 아닙니다.";
  return `${ok.join("·")} 근거는 있으나 ${no.join("·")} 근거는 초록에서 찾지 못했습니다.`;
}

/** DBpia 국내 논문 후보. 실패하면 status "failed"로 돌려주고 전체 검색은 계속된다. */
export async function runDomestic(question: string, normalized: Normalized): Promise<SearchResult["domestic"]> {
  try {
    const papers = await collectDbpia([...normalized.search_queries_ko, ...normalized.method_search_queries_ko]);
    if (papers.length === 0) return { status: "ok", candidates: [] };

    // 한국어 질문 ↔ 한국어 제목+초록 앞부분 (voyage-3.5는 다국어)
    const [sims, msims] = await similarities(
      [question, normalized.method_query_en],
      papers.map((p) => `${p.title}. ${p.abstract}`),
    );
    type Scored = DbpiaPaper & { similarity: number; methodSimilarity: number };
    const byPI = new Map<string, Scored[]>();
    papers.forEach((p, i) =>
      byPI.set(p.piAncId, [...(byPI.get(p.piAncId) ?? []), { ...p, similarity: sims[i], methodSimilarity: msims[i] }]),
    );

    const top = [...byPI.values()]
      .map((ps) => {
        const T = axisScore(ps.map((p) => p.similarity));
        const M = axisScore(ps.map((p) => p.methodSimilarity));
        ps.sort((a, b) => b.similarity + b.methodSimilarity - (a.similarity + a.methodSimilarity));
        return { ps, T, M, score: W_TOPIC * T.value + W_METHOD * M.value };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    const candidates = await Promise.all(
      top.map(async ({ ps, T, M, score }) => {
        const papers3 = ps.slice(0, 3);
        // 검색 결과 초록은 150자 남짓이라, 근거 찾기용으로 상세 페이지의 전체 초록을 받는다
        const [info, ...fulls] = await Promise.all([
          fetchAuthorInfo(ps[0].piAncId),
          ...papers3.map((p) => fetchFullAbstract(p.id)),
        ]);
        const withFull = papers3.map((p, i) => ({ ...p, abstract: fulls[i] ?? p.abstract }));
        const items: ItemResult[] = normalized.items.map((it) => ({
          label: it.label,
          kind: it.kind,
          inferred: it.inferred,
          evidence: findEvidenceKo(it, withFull),
        }));
        const c: DomesticCandidate = {
          ancId: ps[0].piAncId,
          name: ps[0].piName,
          koreanName: isKoreanName(ps[0].piName),
          nameEn: info.nameEn,
          paperCount: info.paperCount,
          fields: info.fields,
          T: round3(T.value),
          fit: fitLabel(T.s1),
          M: round3(M.value),
          methodFit: fitLabel(M.s1),
          score: round3(score),
          topPapers: withFull.map(({ piName: _n, piAncId: _a, ...p }) => ({ ...p, abstract: p.abstract.slice(0, 300) })),
          items,
          warning: buildWarning(items),
          links: {
            dbpia: dbpiaAuthorUrl(ps[0].piAncId),
            search: `https://www.google.com/search?q=${encodeURIComponent(`${ps[0].piName} 교수 ${info.fields[0]?.split(">").pop() ?? ""} 연구실`)}`,
          },
        };
        return c;
      }),
    );
    return { status: "ok", candidates };
  } catch (e) {
    console.error("[dbpia]", e);
    return { status: "failed", candidates: [] };
  }
}
