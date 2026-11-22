/**
 * DBpia 비공식 어댑터 (공개 영역만, 로그인 없음)
 *
 * - 검색: 검색 페이지에서 세션 쿠키를 받은 뒤 POST /api/search/list (웹 화면이 쓰는 내부 API)
 * - 전체 초록: 논문 상세 페이지의 <meta name="citation_abstract">
 * - 저자 정보: 저자 페이지 meta description (영문명, 논문 수, 연구분야. 소속은 공개 영역에서 비어 있음)
 *
 * 원칙: 실패하면 조용히 빠진다(호출부에서 섹션만 숨김). 같은 검색은 캐시한다. 원문·유료 영역은 건드리지 않는다.
 */
import type { Paper } from "./types";

const BASE = "https://www.dbpia.co.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT = 8000;

type DbpiaAuthor = { autrNm: string; istnNm: string; ancId: string | null };
type DbpiaItem = {
  nodeId: string;
  labels: { nodeType: string };
  nodeTitle: string;
  abstractText: string | null;
  publishYymm: string;
  plctNm: string | null;
  authors: DbpiaAuthor[];
};

export type DbpiaPaper = Paper & { piName: string; piAncId: string; journal: string };

export type DbpiaAuthorInfo = { nameEn: string | null; paperCount: string | null; fields: string[] };

let session: { cookie: string; key: string; at: number } | null = null;
const searchCache = new Map<string, DbpiaItem[]>();

function stripMarks(s: string) {
  return s.replace(/<!H[SE]>/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function getSession(query: string) {
  if (session && Date.now() - session.at < 10 * 60 * 1000) return session;
  const res = await fetch(`${BASE}/search/topSearch?searchOption=all&query=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const html = await res.text();
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const key = html.match(/searchResultKey = '([^']+)'/)?.[1] ?? "";
  if (!cookie) throw new Error("DBpia 세션을 받지 못했습니다");
  session = { cookie, key, at: Date.now() };
  return session;
}

async function searchOnce(query: string, fromYear: number): Promise<DbpiaItem[]> {
  const cacheKey = `${query}|${fromYear}`;
  const hit = searchCache.get(cacheKey);
  if (hit) return hit;
  const s = await getSession(query);
  const res = await fetch(`${BASE}/api/search/list`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      Cookie: s.cookie,
      "X-JSP-KEY": s.key,
      Referer: `${BASE}/search/topSearch?searchOption=all&query=${encodeURIComponent(query)}`,
    },
    body: JSON.stringify({
      query,
      page: 1,
      pageSize: 50,
      subjectCodes: [],
      pbshYears: [],
      plctNames: [],
      dataTypes: [],
      publicationInfos: [],
      sort: "RANK",
      collection: "ALL",
      includeAr: false,
      collectionQuery: [],
      collectionQueryStr: "",
      filter: [],
      prefix: [],
      realQuery: "",
      startDate: `${fromYear}.01.01`,
      endDate: "",
      originText: false,
      subjectCategory: "",
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    session = null; // 세션 만료 가능성 → 다음 호출에서 새로 받음
    throw new Error(`DBpia ${res.status}`);
  }
  const data = (await res.json()) as { list?: DbpiaItem[] };
  const list = data.list ?? [];
  searchCache.set(cacheKey, list);
  return list;
}

/**
 * 국내 논문 수집. 책임자는 마지막 저자로 본다(DBpia는 교신저자 표시가 없다).
 * 학위논문은 저자가 학생이라 제외한다.
 */
export async function collectDbpia(queries: string[]): Promise<DbpiaPaper[]> {
  const fromYear = new Date().getFullYear() - 6;
  const settled = await Promise.allSettled(queries.map((q) => searchOnce(q, fromYear)));
  if (settled.every((s) => s.status === "rejected")) throw new Error("DBpia 검색 실패");
  const seen = new Set<string>();
  const out: DbpiaPaper[] = [];
  for (const it of settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))) {
    // 같은 논문이 여러 학회지에 실리는 경우가 있어 제목으로도 중복 제거
    const titleKey = stripMarks(it.nodeTitle).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
    if (seen.has(it.nodeId) || seen.has(titleKey)) continue;
    seen.add(it.nodeId);
    seen.add(titleKey);
    if (it.labels?.nodeType === "학위논문") continue;
    const last = it.authors?.[it.authors.length - 1];
    if (!last?.ancId) continue;
    out.push({
      id: it.nodeId,
      title: stripMarks(it.nodeTitle),
      year: Number(it.publishYymm?.slice(0, 4)) || 0,
      url: `${BASE}/journal/articleDetail?nodeId=${it.nodeId}`,
      abstract: stripMarks(it.abstractText ?? ""),
      piName: last.autrNm,
      piAncId: last.ancId,
      journal: it.plctNm ?? "",
    });
  }
  return out;
}

/** 상세 페이지의 전체 초록 (공개 meta). 실패하면 null */
export async function fetchFullAbstract(nodeId: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/journal/articleDetail?nodeId=${nodeId}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const html = await res.text();
    const m = html.match(/<meta name="citation_abstract" content="([^"]*)"/);
    return m ? decodeEntities(m[1]).trim() : null;
  } catch {
    return null;
  }
}

/** 저자 페이지 meta description에서 영문명·논문 수·연구분야 */
export async function fetchAuthorInfo(ancId: string): Promise<DbpiaAuthorInfo> {
  const empty = { nameEn: null, paperCount: null, fields: [] };
  try {
    const res = await fetch(`${BASE}/author/authorDetail?ancId=${ancId}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const html = await res.text();
    const d = html.match(/property="description" content='([^']*)'/)?.[1];
    if (!d) return empty;
    const nameEn = d.match(/^[^(]*\(([^)]*)\)/)?.[1] || null;
    const paperCount = d.match(/논문수 ([\d,]+)/)?.[1] ?? null;
    const fieldsRaw = d.split("주요 연구분야:")[1]?.trim() ?? "";
    const fields = [...new Set(fieldsRaw.split(/\s(?=[가-힣]+>)/).map((f) => f.trim()).filter(Boolean))].slice(0, 4);
    return { nameEn, paperCount, fields };
  } catch {
    return empty;
  }
}

export function dbpiaAuthorUrl(ancId: string) {
  return `${BASE}/author/authorDetail?ancId=${ancId}`;
}
