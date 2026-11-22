import type { Paper } from "./types";

const BASE = "https://api.openalex.org";
// 대학(education), 출연연·국공립 연구소(facility/government/nonprofit), 대학병원(healthcare)
const ELIGIBLE_TYPES = new Set(["education", "facility", "government", "nonprofit", "healthcare"]);

type OAInstitution = { id: string; display_name: string; type: string | null; country_code: string | null };
type OAAuthorship = {
  author_position: "first" | "middle" | "last";
  is_corresponding?: boolean;
  author: { id: string | null; display_name: string; orcid: string | null };
  institutions: OAInstitution[];
};
type OAWork = {
  id: string;
  doi: string | null;
  title: string | null;
  publication_year: number;
  authorships: OAAuthorship[];
  abstract_inverted_index: Record<string, number[]> | null;
};

export type PI = {
  authorId: string;
  name: string;
  orcid: string | null;
  institution: string;
  institutionType: string;
};

export type PaperWithPI = Paper & { pi: PI };

function rebuildAbstract(inv: Record<string, number[]> | null): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(" ");
}

/**
 * OpenAlex는 군·정부 부처·행정기관도 government로 분류한다. R&E 지도가 가능한 연구기관이 아니므로 이름으로 뺀다.
 * (출연연·국공립 연구원은 이름에 Institute/Research/Center 등이 붙어 걸리지 않는다)
 */
const NON_RESEARCH =
  /\b(army|navy|air force|marine corps|military|armed forces|ministry|police|court|prosecutor|national assembly|office of|presidential|government of|city hall|provincial government|metropolitan government|embassy|customs|tax service|coast guard|fire)\b|국방부|육군|해군|공군|해병대|경찰|법원|검찰|국회|청와대|대통령실|정부/i;
const RESEARCH_WORDS = /\b(institute|research|center|centre|laboratory|laboratories|agency for|observatory|academy)\b|연구/i;

function isResearchOrg(i: OAInstitution): boolean {
  if (i.type === "education" || i.type === "healthcare") return true;
  if (NON_RESEARCH.test(i.display_name) && !RESEARCH_WORDS.test(i.display_name)) return false;
  return true;
}

function eligibleKR(a: OAAuthorship): OAInstitution | undefined {
  if (!a.author?.id) return undefined; // 저자 ID가 없는 레코드는 묶을 수 없다
  return a.institutions.find(
    (i) => i.country_code === "KR" && ELIGIBLE_TYPES.has(i.type ?? "") && isResearchOrg(i),
  );
}

/**
 * 책임자(PI) 판정:
 * 1) 한국 대학·연구소 소속 교신저자 중 가장 뒤쪽 저자
 * 2) 없으면 마지막 저자가 한국 대학·연구소 소속일 때 그 사람
 * 3) 둘 다 아니면 null (논문 제외)
 * OpenAlex의 교신저자 표시는 한 논문에 여러 명이 찍히는 등 부정확해서 위치로 한 번 더 거른다.
 */
export function pickPI(authorships: OAAuthorship[]): PI | null {
  const toPI = (a: OAAuthorship, inst: OAInstitution): PI => ({
    authorId: a.author.id!.replace("https://openalex.org/", ""),
    name: a.author.display_name,
    orcid: a.author.orcid,
    institution: inst.display_name,
    institutionType: inst.type ?? "",
  });
  for (let i = authorships.length - 1; i >= 0; i--) {
    const a = authorships[i];
    const inst = eligibleKR(a);
    if (a.is_corresponding && inst) return toPI(a, inst);
  }
  const last = authorships[authorships.length - 1];
  const inst = last && eligibleKR(last);
  return last && inst ? toPI(last, inst) : null;
}

async function searchOnce(query: string, fromYear: number): Promise<OAWork[]> {
  const params = new URLSearchParams({
    search: query,
    filter: `authorships.institutions.country_code:KR,from_publication_date:${fromYear}-01-01,has_abstract:true`,
    per_page: "100",
    select: "id,doi,title,publication_year,authorships,abstract_inverted_index",
  });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  const res = await fetch(`${BASE}/works?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  const data = (await res.json()) as { results: OAWork[] };
  return data.results;
}

/** 검색어 여러 개로 한국 소속 논문을 모으고, PI가 판정되는 논문만 돌려준다. */
export async function collectPapers(queries: string[]): Promise<PaperWithPI[]> {
  const fromYear = new Date().getFullYear() - 6;
  const settled = await Promise.allSettled(queries.map((q) => searchOnce(q, fromYear)));
  const works = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (works.length === 0 && settled.every((s) => s.status === "rejected")) {
    throw new Error("논문 검색(OpenAlex)에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const seen = new Set<string>();
  const out: PaperWithPI[] = [];
  for (const w of works) {
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const pi = pickPI(w.authorships);
    const abstract = rebuildAbstract(w.abstract_inverted_index);
    if (!pi || !abstract || !w.title) continue;
    out.push({
      id: w.id,
      title: w.title,
      year: w.publication_year,
      url: w.doi ?? w.id,
      abstract,
      pi,
    });
  }
  return out;
}

/**
 * 후보 저자들의 최근 논문(주제 무관)을 한 번에 가져온다. 방법·장비 근거를 찾는 데만 쓴다.
 * 실패해도 빈 결과를 돌려준다(근거 보강은 선택 사항).
 */
export async function fetchAuthorWorks(authorIds: string[]): Promise<Map<string, Paper[]>> {
  const byAuthor = new Map<string, Paper[]>();
  if (authorIds.length === 0) return byAuthor;
  const fromYear = new Date().getFullYear() - 6;
  const params = new URLSearchParams({
    filter: `author.id:${authorIds.join("|")},from_publication_date:${fromYear}-01-01,has_abstract:true`,
    per_page: "200",
    sort: "publication_date:desc",
    select: "id,doi,title,publication_year,authorships,abstract_inverted_index",
  });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  try {
    const res = await fetch(`${BASE}/works?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return byAuthor;
    const data = (await res.json()) as { results: OAWork[] };
    const wanted = new Set(authorIds);
    for (const w of data.results) {
      const abstract = rebuildAbstract(w.abstract_inverted_index);
      if (!abstract || !w.title) continue;
      const paper: Paper = { id: w.id, title: w.title, year: w.publication_year, url: w.doi ?? w.id, abstract };
      for (const a of w.authorships) {
        const id = a.author?.id?.replace("https://openalex.org/", "");
        if (id && wanted.has(id)) byAuthor.set(id, [...(byAuthor.get(id) ?? []), paper]);
      }
    }
  } catch {
    // 근거 보강 실패는 무시
  }
  return byAuthor;
}
