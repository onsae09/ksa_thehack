import { checkAffiliations } from "./affiliation";
import { runDomestic } from "./domestic";
import { similarities } from "./embed";
import { isKoreanName, orgKind } from "./names";
import { axisScore, fitLabel, round3, W_METHOD, W_TOPIC } from "./scoring";
import { normalize } from "./normalize";
import { exaPaperDois } from "./exa";
import { collectByDoi, collectPapers, fetchAuthorWorks, type PaperWithPI } from "./openalex";
import type { Candidate, CheckItem, Evidence, ItemResult, Paper, SearchInput, SearchResult } from "./types";

const TOP_N = 15; // 화면에서 필터를 건 뒤 상위 5명을 보여주므로 넉넉히 계산


function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NEGATION = /\b(no|not|without|never|lack of|lacking|absence of|instead of)\b[^.]*$/i;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter((s) => s.length > 20);
}

/** 초록 원문 문장 중 키워드가 들어 있는 첫 문장. 문장을 만들어내지 않고 원문에서 고르기만 한다. */
function findEvidence(item: CheckItem, papers: Paper[], onTopicIds: Set<string>): Evidence | null {
  if (item.keywords_en.length === 0) return null;
  const re = new RegExp(`\\b(${item.keywords_en.map(escapeRe).join("|")})`, "i");
  for (const p of papers) {
    for (const s of splitSentences(p.abstract)) {
      const m = re.exec(s);
      if (!m) continue;
      // "no experiment has…", "without simulation" 같은 부정 문맥은 근거가 아니다
      if (NEGATION.test(s.slice(Math.max(0, m.index - 30), m.index))) continue;
      return { sentence: s, matched: m[0], paperTitle: p.title, url: p.url, onTopic: onTopicIds.has(p.id) };
    }
  }
  return null;
}

function buildWarning(items: ItemResult[]): string | null {
  const ok = items.filter((i) => i.evidence).map((i) => i.label);
  const no = items.filter((i) => !i.evidence).map((i) => i.label);
  if (no.length === 0) return null;
  if (ok.length === 0) return "초록에서 방법·장비 근거를 찾지 못했습니다. 불가능하다는 뜻은 아니며, 논문 본문이나 직접 문의로 확인해야 합니다.";
  return `${ok.join("·")} 근거는 있으나 ${no.join("·")} 근거는 초록에서 찾지 못했습니다.`;
}

export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const t0 = Date.now();
  const normalized = await normalize(input);
  // 국내(DBpia)는 별도 섹션. OpenAlex와 병렬로 돌리고, 실패해도 전체 결과에는 영향 없음
  const domesticP = runDomestic(input.question, normalized);
  // 주제 검색어 + 방법·장비 검색어: 주제가 달라도 필요한 방법·장비를 갖춘 연구실을 후보 풀에 넣는다
  // + Exa 의미 검색(키가 있을 때만): 키워드가 달라 놓친 논문의 DOI → OpenAlex에서 저자·소속
  const [keywordPapers, exaPapers] = await Promise.all([
    collectPapers([...normalized.search_queries, ...normalized.method_search_queries]),
    exaPaperDois([normalized.query_en, normalized.method_query_en])
      .then(collectByDoi)
      .catch(() => [] as PaperWithPI[]),
  ]);
  const seenIds = new Set(keywordPapers.map((p) => p.id));
  const papers = [...keywordPapers, ...exaPapers.filter((p) => !seenIds.has(p.id))];
  if (papers.length === 0) {
    return { normalized, candidates: [], domestic: await domesticP, stats: { papers: 0, authors: 0, ms: Date.now() - t0 } };
  }

  const docs = papers.map((p) => `${p.title}. ${p.abstract}`.slice(0, 4000));
  const [topicSims, methodSims] = await similarities([normalized.query_en, normalized.method_query_en], docs);

  // 책임자별로 묶기
  type Scored = PaperWithPI & { similarity: number; methodSimilarity: number };
  const byPI = new Map<string, Scored[]>();
  papers.forEach((p, i) => {
    byPI.set(p.pi.authorId, [...(byPI.get(p.pi.authorId) ?? []), { ...p, similarity: topicSims[i], methodSimilarity: methodSims[i] }]);
  });

  const scored = [...byPI.values()].map((ps) => {
    const T = axisScore(ps.map((p) => p.similarity));
    const M = axisScore(ps.map((p) => p.methodSimilarity));
    ps.sort((a, b) => b.similarity + b.methodSimilarity - (a.similarity + a.methodSimilarity));
    return { ps, T, M, score: W_TOPIC * T.value + W_METHOD * M.value };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N);

  // 근거 보강: 상위 후보의 최근 논문(주제 무관)에서도 방법·장비 문장을 찾는다
  // 현재 소속 확인도 함께 (요청 1번)
  const [extra, affiliations] = await Promise.all([
    fetchAuthorWorks(top.map(({ ps }) => ps[0].pi.authorId)),
    checkAffiliations(top.map(({ ps }) => ({ authorId: ps[0].pi.authorId, institutionId: ps[0].pi.institutionId }))),
  ]);

  const candidates: Candidate[] = top.map(({ ps, T, M, score }) => {
    const pi = ps[0].pi;
    const seen = new Set(ps.map((p) => p.id));
    const evidencePool: Paper[] = [...ps, ...(extra.get(pi.authorId) ?? []).filter((p) => !seen.has(p.id))];
    const items: ItemResult[] = normalized.items.map((it) => ({
      label: it.label,
      kind: it.kind,
      inferred: it.inferred,
      evidence: findEvidence(it, evidencePool, seen),
    }));
    return {
      authorId: pi.authorId,
      name: pi.name,
      orcid: pi.orcid,
      institution: pi.institution,
      institutionId: pi.institutionId,
      institutionType: pi.institutionType,
      orgKind: orgKind(pi.institutionType),
      affiliation: affiliations.get(pi.authorId) ?? { status: "unknown", lastYear: null, note: null },
      koreanName: isKoreanName(pi.name),
      T: round3(T.value),
      fit: fitLabel(T.s1),
      M: round3(M.value),
      methodFit: fitLabel(M.s1),
      score: round3(score),
      topPapers: ps.slice(0, 3).map(({ pi: _pi, ...p }) => ({ ...p, abstract: p.abstract.slice(0, 600) })),
      items,
      warning: buildWarning(items),
      links: {
        openalex: `https://openalex.org/${pi.authorId}`,
        orcid: pi.orcid,
        search: `https://www.google.com/search?q=${encodeURIComponent(`${pi.name} ${pi.institution} 연구실`)}`,
      },
    };
  });

  return {
    normalized,
    candidates,
    domestic: await domesticP,
    stats: {
      papers: papers.length,
      authors: byPI.size,
      ms: Date.now() - t0,
      exaPapers: exaPapers.filter((p) => !seenIds.has(p.id)).length,
    },
  };
}
