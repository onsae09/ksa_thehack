/**
 * 제안서에 적힌 연락 예정 교수 찾기. 검색 상위 15명 안에 없을 때 화면이 따로 부른다.
 *
 * 1) OpenAlex 저자 검색(영문 이름) → 이름 표기가 맞는 기록만 (영문 표기 일치 또는 한글 이름 로마자 일치)
 * 2) 제안서의 소속(예: "KAIST 물리학과")과 기관이 맞는 기록을 고른다 (한국어 기관명·약어·영문명 비교).
 *    OpenAlex는 한 사람을 저자 ID 여러 개로 나누기도 해서, 이름·기관이 모두 맞는 기록은 합친다.
 * 3) 최근 6년 논문(책임저자 위치 우선)으로 검색 파이프라인과 똑같이 주제 T·방법 M을 계산하고 근거 문장을 찾는다.
 * 4) 검색에서 점수를 받은 책임저자 전원의 점수와 비교해 "몇 위 수준"인지 돌려준다. 순위 자체에는 넣지 않는다.
 *
 * 확실하지 않은 것(동명이인, 기관 불일치, 비교 범위 차이)은 caveats에 그대로 적는다.
 */
import { checkAffiliations } from "./affiliation";
import { similarities } from "./embed";
import { buildWarning, itemResults } from "./evidence";
import { koreanInstitutionNames, koreanNameMatches, normOrgan, sameOrgan } from "./kornames";
import { isKoreanName, orgKind } from "./names";
import { fetchInstitutionGeo } from "./region";
import { axisScore, fitLabel, round3, W_METHOD, W_TOPIC } from "./scoring";
import type { Candidate, CheckItem, Paper } from "./types";

const BASE = "https://api.openalex.org";

export type AdvisorRequest = {
  name: string; // 제안서 표기 (한글)
  name_en: string;
  affiliation: string; // 제안서 표기 (예: "KAIST 물리학과")
  query_en: string;
  method_query_en: string;
  items: CheckItem[];
};

export type AdvisorMatch = { authorId: string; name: string; institution: string | null; works: number; used: boolean };

/** 캐시되는 부분 (순위 비교 전) */
export type AdvisorCore = {
  status: "found" | "uncertain" | "not_found";
  candidate: Candidate | null;
  /** 점수 계산에 쓴 논문 수 */
  papersScored: number;
  /** 책임저자(마지막·교신) 논문만 썼는지 */
  piOnly: boolean;
  matches: AdvisorMatch[];
  caveats: string[];
};

export type AdvisorResult = AdvisorCore & {
  /** 검색에서 점수를 받은 책임저자 전원 중 이 교수 점수가 들어갈 자리 (1부터) */
  scoreRank: number | null;
  /** 비교한 책임저자 수 */
  compared: number | null;
  /** 화면에 그대로 쓸 한 줄 (예: "점수상 18위 수준") */
  rankText: string | null;
};

type OAAuthor = {
  id: string;
  display_name: string;
  display_name_alternatives?: string[] | null;
  works_count: number;
  affiliations?: { institution: { id: string; display_name: string; country_code: string | null; type: string | null }; years: number[] }[] | null;
  last_known_institutions?: { id: string; display_name: string; country_code: string | null; type: string | null }[] | null;
};

type OAWork = {
  id: string;
  doi: string | null;
  title: string | null;
  publication_year: number;
  abstract_inverted_index: Record<string, number[]> | null;
  authorships: { author_position: string; is_corresponding?: boolean; author: { id: string | null } }[];
};

const strip = (id: string) => id.replace("https://openalex.org/", "");
const withKey = (p: URLSearchParams) => {
  if (process.env.OPENALEX_API_KEY) p.set("api_key", process.env.OPENALEX_API_KEY);
  return p;
};

async function getJSON<T>(path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE}/${path}?${withKey(params)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  return (await res.json()) as T;
}

function rebuildAbstract(inv: Record<string, number[]> | null): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(" ");
}

/** 영문 이름 두 표기가 같은가: 대소문자·하이픈·띄어쓰기·순서 무시 ("YongKeun Park" = "Park Yong-Keun") */
export function sameEnglishName(a: string, b: string): boolean {
  const key = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .split(/[\s,.\-‐]+/)
      .map((t) => t.replace(/[^a-z]/g, ""))
      .filter(Boolean);
  const ta = key(a);
  const tb = key(b);
  if (ta.length < 2 || tb.length < 2) return false;
  // 성 + 이름 붙여 쓰기 차이: 성(맨 앞 또는 맨 뒤)을 떼고 나머지를 이어 붙여 비교
  const forms = (t: string[]) => new Set([`${t[t.length - 1]}|${t.slice(0, -1).join("")}`, `${t[0]}|${t.slice(1).join("")}`]);
  const fa = forms(ta);
  return [...forms(tb)].some((f) => fa.has(f));
}

function nameMatches(req: AdvisorRequest, a: OAAuthor): boolean {
  // 대표 이름으로만 비교한다. "Y Park"처럼 이니셜뿐인 기록은 여러 사람 논문이 섞인 경우가 많아 다른 이름 목록에
  // "YongKeun Park"이 있어도 쓰지 않는다
  if (req.name_en && sameEnglishName(a.display_name, req.name_en)) return true;
  if (/^[가-힣]{2,4}$/.test(req.name.replace(/\s/g, ""))) {
    // 한글 이름 로마자 일치는 대표 이름으로만 (다른 이름 목록에는 엉뚱한 표기가 섞인다)
    if (koreanNameMatches(req.name, a.display_name)) return true;
  }
  return false;
}

// 소속 문자열에서 학과·단과대 표기를 떼어낸 기관 부분 후보 ("KAIST 물리학과" → ["KAIST"])
const DEPT = /(학과|학부|전공|대학원|연구소|연구실|센터|department|dept\.?|school of|college of|division)/i;
function orgTokens(affiliation: string): string[] {
  const parts = affiliation
    .split(/[\s,·/()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !DEPT.test(t));
  return [...new Set([affiliation.trim(), ...parts])];
}

type InstInfo = { id: string; display_name: string; acronyms: string[]; ko: string | null };

async function institutionInfo(ids: string[]): Promise<Map<string, InstInfo>> {
  const out = new Map<string, InstInfo>();
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return out;
  const [ko, data] = await Promise.all([
    koreanInstitutionNames(uniq),
    getJSON<{ results: { id: string; display_name: string; display_name_acronyms?: string[] | null }[] }>(
      "institutions",
      new URLSearchParams({ filter: `id:${uniq.slice(0, 50).join("|")}`, select: "id,display_name,display_name_acronyms", per_page: "50" }),
    ).catch(() => ({ results: [] })),
  ]);
  for (const r of data.results) {
    const id = strip(r.id);
    out.set(id, { id, display_name: r.display_name, acronyms: r.display_name_acronyms ?? [], ko: ko.get(id) ?? null });
  }
  for (const id of uniq) if (!out.has(id)) out.set(id, { id, display_name: id, acronyms: [], ko: ko.get(id) ?? null });
  return out;
}

/** 제안서 소속과 OpenAlex 기관이 같은 곳인가 (한국어 기관명은 sameOrgan, 약어·영문명은 낱말 비교) */
export function institutionMatches(affiliation: string, inst: InstInfo): boolean {
  const tokens = orgTokens(affiliation);
  for (const t of tokens) {
    if (inst.ko && /[가-힣]/.test(t) && sameOrgan(t, inst.ko)) return true;
    const low = t.toLowerCase();
    if (inst.acronyms.some((a) => a.toLowerCase() === low)) return true;
    if (/^[a-z][a-z .&-]{5,}$/i.test(t) && inst.display_name.toLowerCase().includes(low)) return true;
  }
  // "서울대학교 물리학과" ↔ "서울대학교"
  return !!inst.ko && normOrgan(affiliation).includes(normOrgan(inst.ko));
}

export async function lookupAdvisor(req: AdvisorRequest): Promise<AdvisorCore> {
  const caveats: string[] = [];
  const empty = (status: AdvisorCore["status"], why: string): AdvisorCore => ({
    status,
    candidate: null,
    papersScored: 0,
    piOnly: false,
    matches: [],
    caveats: [...caveats, why],
  });
  const q = req.name_en.trim() || req.name.trim();
  if (!q) return empty("not_found", "제안서에 교수 이름이 없습니다.");

  // 1) 저자 검색
  const found = await getJSON<{ results: OAAuthor[] }>(
    "authors",
    new URLSearchParams({
      search: q,
      per_page: "25",
      select: "id,display_name,display_name_alternatives,works_count,affiliations,last_known_institutions",
    }),
  );
  const byName = found.results.filter((a) => nameMatches(req, a));
  if (byName.length === 0) return empty("not_found", `OpenAlex에서 「${q}」 표기의 저자 기록을 찾지 못했습니다.`);

  // 2) 기관 맞추기: 저자 기록의 모든 소속 기관 + 최근 소속
  const instIds = byName.flatMap((a) => [
    ...(a.affiliations ?? []).map((x) => strip(x.institution.id)),
    ...(a.last_known_institutions ?? []).map((x) => strip(x.id)),
  ]);
  const info = await institutionInfo(instIds.slice(0, 50));
  const now = new Date().getFullYear();
  type Scored = { a: OAAuthor; inst: InstInfo | null; instYear: number | null; kr: boolean };
  const scored: Scored[] = byName.map((a) => {
    const affs = (a.affiliations ?? []).map((x) => ({ id: strip(x.institution.id), year: Math.max(...x.years, 0), kr: x.institution.country_code === "KR" }));
    for (const l of a.last_known_institutions ?? []) affs.push({ id: strip(l.id), year: now, kr: l.country_code === "KR" });
    const hit = affs
      .filter((x) => info.has(x.id) && institutionMatches(req.affiliation, info.get(x.id)!))
      .sort((x, y) => y.year - x.year)[0];
    return { a, inst: hit ? info.get(hit.id)! : null, instYear: hit?.year ?? null, kr: affs.some((x) => x.kr) };
  });

  const instMatched = scored.filter((s) => s.inst);
  let used: Scored[];
  let status: AdvisorCore["status"] = "found";
  if (instMatched.length > 0) {
    used = instMatched;
    if (instMatched.length > 1) {
      caveats.push(
        `OpenAlex에 이름·기관이 같은 저자 기록이 ${instMatched.length}개 있어 같은 사람으로 보고 합쳤습니다 (OpenAlex가 한 사람을 여러 기록으로 나누는 일이 흔합니다).`,
      );
    }
    const others = scored.filter((s) => !s.inst && s.kr).length;
    if (others > 0) caveats.push(`같은 이름 표기의 다른 기관 저자 ${others}명은 제외했습니다 (동명이인).`);
  } else {
    // 기관이 맞는 기록이 없으면 한국 기관 기록 중 논문이 가장 많은 사람 (불확실)
    const kr = scored.filter((s) => s.kr).sort((x, y) => y.a.works_count - x.a.works_count);
    if (kr.length === 0) return empty("not_found", `「${q}」 표기의 한국 기관 저자 기록이 없습니다.`);
    used = [kr[0]];
    status = "uncertain";
    caveats.push(`제안서의 소속(${req.affiliation})과 맞는 OpenAlex 기관 기록이 없어, 같은 이름 표기의 한국 기관 저자 중 논문이 가장 많은 기록을 골랐습니다. 다른 사람일 수 있습니다.`);
    if (kr.length > 1) caveats.push(`같은 이름 표기의 한국 기관 저자가 ${kr.length}명 있습니다 (동명이인 가능).`);
  }
  used.sort((x, y) => y.a.works_count - x.a.works_count);
  const main = used[0];
  const ids = used.map((s) => strip(s.a.id)).slice(0, 5);
  if (used.length > 5) caveats.push(`그중 논문이 많은 기록 5개의 논문만 썼습니다.`);

  // 3) 최근 6년 논문
  const fromYear = now - 6;
  const worksData = await getJSON<{ results: OAWork[] }>(
    "works",
    new URLSearchParams({
      filter: `author.id:${ids.join("|")},from_publication_date:${fromYear}-01-01,has_abstract:true`,
      per_page: "100",
      sort: "publication_date:desc",
      select: "id,doi,title,publication_year,authorships,abstract_inverted_index",
    }),
  );
  const idSet = new Set(ids);
  const all = worksData.results
    .map((w) => {
      const me = w.authorships.findIndex((x) => x.author?.id && idSet.has(strip(x.author.id)));
      const pi = me >= 0 && (w.authorships[me].is_corresponding || me === w.authorships.length - 1);
      return { paper: { id: w.id, title: w.title ?? "", year: w.publication_year, url: w.doi ?? w.id, abstract: rebuildAbstract(w.abstract_inverted_index) } as Paper, pi };
    })
    .filter((x) => x.paper.title && x.paper.abstract);
  const piPapers = all.filter((x) => x.pi).map((x) => x.paper);
  // 검색 파이프라인은 책임저자(교신·마지막 저자) 논문만 센다. 같은 기준을 쓰되, 너무 적으면 전체로
  const piOnly = piPapers.length >= 3;
  const papers = piOnly ? piPapers : all.map((x) => x.paper);
  if (papers.length === 0) {
    return { ...empty(status === "found" ? "uncertain" : status, `최근 ${now - fromYear}년 사이 초록이 있는 논문 기록이 없어 점수를 계산하지 못했습니다.`), matches: toMatches(used, scored) };
  }
  if (!piOnly) caveats.push(`책임저자(교신·마지막 저자) 논문이 ${piPapers.length}편뿐이라 공저 논문까지 포함해 계산했습니다.`);
  caveats.push(
    `검색 후보는 검색어에 걸린 논문만으로 점수를 받지만, 이 교수는 최근 논문 ${papers.length}편 전체로 계산했습니다. 같은 계산식이지만 비교 범위가 넓어 순위가 실제보다 유리하게 나올 수 있습니다.`,
  );

  // 4) 파이프라인과 같은 점수
  const docs = papers.map((p) => `${p.title}. ${p.abstract}`.slice(0, 4000));
  const [ts, ms] = await similarities([req.query_en, req.method_query_en], docs);
  const T = axisScore(ts);
  const M = axisScore(ms);
  const withSim = papers.map((p, i) => ({ ...p, similarity: round3(ts[i]), methodSimilarity: round3(ms[i]) }));
  withSim.sort((a, b) => b.similarity + b.methodSimilarity - (a.similarity + a.methodSimilarity));
  const top3 = withSim.slice(0, 3);
  const items = itemResults(req.items, withSim, new Set(top3.map((p) => p.id)));

  const instId = main.inst?.id ?? strip((main.a.last_known_institutions ?? [])[0]?.id ?? "");
  const instName = main.inst?.display_name ?? (main.a.last_known_institutions ?? [])[0]?.display_name ?? "";
  const instType =
    (main.a.affiliations ?? []).find((x) => strip(x.institution.id) === instId)?.institution.type ??
    (main.a.last_known_institutions ?? []).find((x) => strip(x.id) === instId)?.type ??
    "education";
  const koNames = new Map<string, string>();
  const [aff, geo] = await Promise.all([
    checkAffiliations([{ authorId: strip(main.a.id), institutionId: instId, name: main.a.display_name }], koNames),
    fetchInstitutionGeo([instId]).catch(() => new Map()),
  ]);
  const authorId = strip(main.a.id);
  const nameKo = koNames.get(authorId) ?? (koreanNameMatches(req.name, main.a.display_name) ? req.name : null);
  const candidate: Candidate = {
    authorId,
    name: main.a.display_name,
    nameKo,
    orcid: null,
    institution: instName,
    institutionId: instId,
    institutionType: instType ?? "education",
    orgKind: orgKind(instType ?? "education"),
    sido: geo.get(instId)?.sido ?? null,
    affiliation: aff.get(authorId) ?? { status: "unknown", lastYear: null, note: null },
    koreanName: isKoreanName(main.a.display_name),
    T: round3(T.value),
    fit: fitLabel(T.s1),
    M: round3(M.value),
    methodFit: fitLabel(M.s1),
    score: round3(W_TOPIC * T.value + W_METHOD * M.value),
    topPapers: top3.map((p) => ({ ...p, abstract: p.abstract.slice(0, 600) })),
    items,
    warning: buildWarning(items),
    links: {
      openalex: `https://openalex.org/${authorId}`,
      orcid: null,
      search: `https://www.google.com/search?q=${encodeURIComponent(`${main.a.display_name} ${instName} 연구실`)}`,
    },
    group: "main",
    groupReason: null,
  };
  return { status, candidate, papersScored: papers.length, piOnly, matches: toMatches(used, scored), caveats };
}

function toMatches(used: { a: OAAuthor }[], all: { a: OAAuthor; inst: InstInfo | null }[]): AdvisorMatch[] {
  const usedIds = new Set(used.map((u) => u.a.id));
  return all.slice(0, 8).map((s) => ({
    authorId: strip(s.a.id),
    name: s.a.display_name,
    institution: s.inst?.display_name ?? (s.a.last_known_institutions ?? [])[0]?.display_name ?? null,
    works: s.a.works_count,
    used: usedIds.has(s.a.id),
  }));
}

/** 검색에서 점수를 받은 책임저자 점수(내림차순)와 비교한 자리 */
export function rankAgainst(core: AdvisorCore, scores: number[] | undefined): Pick<AdvisorResult, "scoreRank" | "compared" | "rankText"> {
  if (!core.candidate || !scores?.length) return { scoreRank: null, compared: null, rankText: null };
  const s = core.candidate.score;
  const rank = scores.filter((x) => x > s).length + 1;
  // 이 교수는 최근 논문 전체로, 다른 후보는 검색에 걸린 논문만으로 계산했으므로 "수준"이라고만 쓴다 (caveats에 설명)
  const rankText = `점수상 ${rank}위 수준 (책임저자 ${scores.length.toLocaleString()}명과 비교, 최근 논문 전체 기준)`;
  return { scoreRank: rank, compared: scores.length, rankText };
}
