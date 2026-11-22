import { checkAffiliations } from "./affiliation";
import { fetchInstitutionGeo, type InstitutionGeo } from "./region";
import { runDomestic } from "./domestic";
import { similarities } from "./embed";
import { isKoreanName, orgKind } from "./names";
import { axisScore, fitLabel, round3, W_METHOD, W_TOPIC } from "./scoring";
import { normalize } from "./normalize";
import { exaPaperDois } from "./exa";
import { collectByDoi, collectPapers, fetchAuthorWorks, type PaperWithPI } from "./openalex";
import { buildWarning, itemResults } from "./evidence";
import type { AffiliationCheck, Candidate, CandidateGroup, ItemResult, Paper, SearchInput, SearchProgressEvent, SearchResult } from "./types";

const TOP_N = 15; // 화면에서 필터를 건 뒤 상위 5명을 보여주므로 넉넉히 계산


/** onProgress: 단계가 시작·끝날 때 실제 수치와 함께 부른다 (화면 진행 표시용). 없으면 조용히 돈다 */
export async function runSearch(
  input: SearchInput,
  onProgress: (e: SearchProgressEvent) => void = () => {},
  opts: { freshNormalize?: boolean } = {},
): Promise<SearchResult> {
  const t0 = Date.now();
  onProgress({ stage: "normalize", status: "start" });
  const normalized = await normalize(input, { fresh: opts.freshNormalize });
  const equipmentQueries = normalized.equipment_queries ?? [];
  const queries = [...normalized.search_queries, ...normalized.method_search_queries, ...equipmentQueries];
  onProgress({
    stage: "normalize",
    status: "done",
    detail: `검색어 ${queries.length}개 · 확인할 항목 ${normalized.items.map((i) => i.label).join(", ")}`,
  });
  // 국내(DBpia)는 별도 섹션. OpenAlex와 병렬로 돌리고, 실패해도 전체 결과에는 영향 없음
  onProgress({ stage: "collect", status: "start" });
  const domesticP = runDomestic(input.question, normalized).then((d) => {
    onProgress({
      stage: "domestic",
      status: "done",
      detail: d.status === "ok" ? `국내 학술지(DBpia) 후보 ${d.candidates.length}명` : "국내 학술지(DBpia) 검색 실패",
    });
    return d;
  });
  // 주제 검색어 + 방법·장비 검색어: 주제가 달라도 필요한 방법·장비를 갖춘 연구실을 후보 풀에 넣는다
  // + Exa 의미 검색(키가 있을 때만): 키워드가 달라 놓친 논문의 DOI → OpenAlex에서 저자·소속
  const [keywordPapers, exaPapers] = await Promise.all([
    collectPapers(queries),
    exaPaperDois([normalized.query_en, normalized.method_query_en])
      .then(collectByDoi)
      .catch(() => [] as PaperWithPI[]),
  ]);
  const seenIds = new Set(keywordPapers.map((p) => p.id));
  const papers = [...keywordPapers, ...exaPapers.filter((p) => !seenIds.has(p.id))];
  const exaNew = exaPapers.filter((p) => !seenIds.has(p.id)).length;
  onProgress({
    stage: "collect",
    status: "done",
    detail: `한국 소속 논문 ${papers.length}편${exaNew ? ` · 의미 검색으로 ${exaNew}편 추가` : ""}`,
  });
  if (papers.length === 0) {
    return { normalized, candidates: [], domestic: await domesticP, stats: { papers: 0, authors: 0, ms: Date.now() - t0, scores: [] } };
  }

  onProgress({ stage: "score", status: "start" });
  const docs = papers.map((p) => `${p.title}. ${p.abstract}`.slice(0, 4000));
  const [topicSims, methodSims] = await similarities([normalized.query_en, normalized.method_query_en], docs);

  // 책임자별로 묶기
  type Scored = PaperWithPI & { similarity: number; methodSimilarity: number };
  const byPI = new Map<string, Scored[]>();
  papers.forEach((p, i) => {
    // OpenAlex가 한 사람을 저자 ID 여러 개로 나눠 갖는 경우가 있어(같은 이름·같은 기관이 두 번 나옴) 이름+기관으로 묶는다
    const key = `${p.pi.name.toLowerCase().replace(/[^a-z가-힣]/g, "")}|${p.pi.institutionId}`;
    byPI.set(key, [...(byPI.get(key) ?? []), { ...p, similarity: topicSims[i], methodSimilarity: methodSims[i] }]);
  });

  const scored = [...byPI.values()].map((ps) => {
    const T = axisScore(ps.map((p) => p.similarity));
    const M = axisScore(ps.map((p) => p.methodSimilarity));
    ps.sort((a, b) => b.similarity + b.methodSimilarity - (a.similarity + a.methodSimilarity));
    return { ps, T, M, score: W_TOPIC * T.value + W_METHOD * M.value };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N);
  const allScores = scored.slice(0, 1000).map((x) => round3(x.score));
  onProgress({ stage: "score", status: "done", detail: `책임저자 ${byPI.size}명 중 상위 ${top.length}명` });
  onProgress({ stage: "evidence", status: "start" });

  // 근거 보강: 상위 후보의 최근 논문(주제 무관)에서도 방법·장비 문장을 찾는다
  // 현재 소속 확인도 함께 (요청 1번)
  // 기관 위치(시·도)는 통학 지역 필터용
  const koNames = new Map<string, string>(); // 저자 기록에서 확인한 한글 이름 (영문 표기와 맞는 것만)
  const [extra, affiliations, geo] = await Promise.all([
    fetchAuthorWorks(top.map(({ ps }) => ps[0].pi.authorId)),
    checkAffiliations(
      top.map(({ ps }) => ({ authorId: ps[0].pi.authorId, institutionId: ps[0].pi.institutionId, name: ps[0].pi.name })),
      koNames,
    ),
    fetchInstitutionGeo(top.map(({ ps }) => ps[0].pi.institutionId)).catch(() => new Map<string, InstitutionGeo>()),
  ]);

  const ranked: Candidate[] = top.map(({ ps, T, M, score }, idx) => {
    const pi = ps[0].pi;
    const seen = new Set(ps.map((p) => p.id));
    const evidencePool: Paper[] = [...ps, ...(extra.get(pi.authorId) ?? []).filter((p) => !seen.has(p.id))];
    const items: ItemResult[] = itemResults(normalized.items, evidencePool, seen);
    const affiliation = affiliations.get(pi.authorId) ?? { status: "unknown" as const, lastYear: null, note: null };
    const methodFit = fitLabel(M.s1);
    const g = groupOf(affiliation, items, methodFit);
    return {
      authorId: pi.authorId,
      name: pi.name,
      nameKo: koNames.get(pi.authorId) ?? null,
      orcid: pi.orcid,
      institution: pi.institution,
      institutionId: pi.institutionId,
      institutionType: pi.institutionType,
      orgKind: orgKind(pi.institutionType),
      sido: geo.get(pi.institutionId)?.sido ?? null,
      affiliation,
      koreanName: isKoreanName(pi.name),
      T: round3(T.value),
      fit: fitLabel(T.s1),
      M: round3(M.value),
      methodFit,
      score: round3(score),
      group: g.group,
      groupReason: g.reason,
      scoreRank: idx + 1,
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

  // 묶음 순서: 본 순위 → 근거 약한 후보 → 소속 확인 필요 (각 묶음 안은 점수순). 아무도 숨기지 않는다
  const ORDER: CandidateGroup[] = ["main", "weak", "affiliation"];
  const candidates = ORDER.flatMap((grp) => ranked.filter((c) => (c.group ?? "main") === grp));

  const withEvidence = candidates.filter((c) => c.items.some((i) => i.evidence)).length;
  onProgress({ stage: "evidence", status: "done", detail: `${candidates.length}명 중 ${withEvidence}명에게서 근거 문장 찾음` });

  return {
    normalized,
    candidates,
    domestic: await domesticP,
    stats: {
      papers: papers.length,
      authors: byPI.size,
      ms: Date.now() - t0,
      exaPapers: exaPapers.filter((p) => !seenIds.has(p.id)).length,
      scores: allScores,
    },
  };
}

/**
 * 순위 묶음 규칙 (숨기지 않고, 이유를 화면에 그대로 보여준다)
 * 1) 소속 확인 필요: 이 한국 기관 소속 마지막 기록이 2년보다 오래됐고(stale), 그 뒤 기록이 해외 기관뿐
 *    → 지금은 한국에 없을 가능성이 커서 본 순위에서 뺀다 (예: Kishan Dholakia — Yonsei 기록 2023, 이후 St Andrews)
 *    그 뒤 기록이 한국 기관이면 국내 이동이라 순위에 둔다 (꼬리표만).
 * 2) 근거 약함: 필요한 방법·장비·데이터 어느 것도 초록 근거 문장이 없고, 방법 적합도도 낮음
 *    → 점수(주제 유사도)만 높고 방법이 다른 연구실(예: 이론·수학 위주)일 가능성이 커서 근거 있는 후보 뒤로 보낸다.
 *    연구실 페이지·ZEUS·본문 근거는 나중에 불러오므로 이 규칙에 쓰지 않는다 (표에서 따로 확인 가능).
 */
export function groupOf(
  a: AffiliationCheck,
  items: ItemResult[],
  methodFit: Candidate["methodFit"],
): { group: CandidateGroup; reason: string | null } {
  if (a.status === "stale" && a.later && a.later.country && a.later.country !== "KR") {
    return {
      group: "affiliation",
      reason: `이 기관 소속 마지막 논문이 ${a.lastYear}년이고, 그 뒤 ${a.later.year}년 기록은 해외 기관(${a.later.institution})입니다. 지금 한국에 있는지 확인이 필요해 순위에서 뺐습니다.`,
    };
  }
  if (items.length > 0 && items.every((i) => !i.evidence) && methodFit === "낮음") {
    return {
      group: "weak",
      reason: "필요한 방법·장비 어느 것도 초록에서 근거 문장을 찾지 못했고 방법 적합도도 낮아, 근거가 있는 후보 뒤로 보냈습니다.",
    };
  }
  return { group: "main", reason: null };
}
