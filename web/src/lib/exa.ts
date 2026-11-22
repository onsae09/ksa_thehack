/**
 * Exa 검색 (EXA_API_KEY가 있을 때만 켜진다)
 *
 * 1) 의미 기반 논문 검색: 키워드 검색이 놓치는 논문을 찾아 DOI만 뽑는다 → OpenAlex에서 저자·소속을 가져온다.
 *    Exa 결과의 저자 정보는 쓰지 않는다(구조화돼 있지 않음).
 * 2) 연구실 홈페이지 확인: "이름 + 기관 + 연구실"로 찾아, 그 사람이 주인공인 페이지인지 확인한 뒤
 *    필요 장비가 페이지에 적혀 있는지 원문 문장으로만 보여준다.
 */
import { koreanNameMatches } from "./kornames";
import type { LabPage } from "./types";

const API = "https://api.exa.ai/search";
const TIMEOUT = 15000;

export function exaEnabled(): boolean {
  return !!process.env.EXA_API_KEY;
}

type ExaResult = { url: string; title: string | null; text?: string; publishedDate?: string | null };

const cache = new Map<string, ExaResult[]>();

async function exaSearch(body: Record<string, unknown>): Promise<ExaResult[]> {
  const key = JSON.stringify(body);
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.EXA_API_KEY ?? "" },
    body: key,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { results?: ExaResult[] };
  const out = data.results ?? [];
  cache.set(key, out);
  return out;
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>#?]+)/i;

function extractDoi(r: ExaResult): string | null {
  let url = r.url;
  try {
    url = decodeURIComponent(r.url);
  } catch {
    // 잘못 인코딩된 주소는 그대로
  }
  const fromUrl = url.match(DOI_RE)?.[1];
  const fromText = r.text?.slice(0, 3000).match(DOI_RE)?.[1];
  const doi = (fromUrl ?? fromText)?.replace(/[.,;)\]]+$/, "").replace(/\/(full|abstract|pdf|epdf)$/i, "");
  return doi ? doi.toLowerCase() : null;
}

/** 의미 기반 논문 검색 → DOI 목록. 실패하면 빈 배열 */
export async function exaPaperDois(queries: string[]): Promise<string[]> {
  if (!exaEnabled()) return [];
  const startPublishedDate = `${new Date().getFullYear() - 6}-01-01T00:00:00.000Z`;
  const settled = await Promise.allSettled(
    queries.slice(0, 3).map((q) =>
      exaSearch({
        query: `${q} (research by a Korean university or institute)`,
        type: "auto",
        category: "research paper",
        numResults: 25,
        startPublishedDate,
        contents: { text: { maxCharacters: 1500 } },
      }),
    ),
  );
  const dois = new Set<string>();
  for (const s of settled) {
    if (s.status === "rejected") {
      console.error("[exa papers]", s.reason instanceof Error ? s.reason.message : s.reason);
      continue;
    }
    for (const r of s.value) {
      const d = extractDoi(r);
      if (d) dois.add(d);
    }
  }
  return [...dois];
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 페이지 원문에서 키워드 주변 문장 하나 (만들어내지 않고 잘라내기만) */
function snippetAround(text: string, terms: string[]): string | null {
  const usable = terms.filter((t) => t.trim().length >= 2);
  if (usable.length === 0) return null;
  const re = new RegExp(usable.map(escapeRe).join("|"), "i");
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, text.lastIndexOf("\n", m.index) + 1, m.index - 80);
  const nl = text.indexOf("\n", m.index);
  const end = Math.min(text.length, nl > 0 ? nl : text.length, m.index + m[0].length + 100);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** 페이지에 적힌 한글 이름 중 영문 이름과 표기가 맞는 것 */
function findKoreanName(text: string, enName: string): string | null {
  const seen = new Set<string>();
  for (const m of text.matchAll(/([가-힣]{2,4})\s*(?:교수|박사|책임연구원|선임연구원|연구원|Professor|PI)/g)) {
    const n = m[1];
    if (seen.has(n)) continue;
    seen.add(n);
    if (koreanNameMatches(n, enName)) return n;
  }
  // "교수" 표기가 없는 페이지: 세 글자 이름 후보 전부 검사
  for (const m of text.slice(0, 4000).matchAll(/(?<![가-힣])([가-힣]{3})(?![가-힣])/g)) {
    if (koreanNameMatches(m[1], enName)) return m[1];
  }
  return null;
}

/** 영문 이름의 모든 토큰이 들어 있는가 ("KIM, KYUNG CHUN"도 맞음) */
function mentionsName(text: string, enName: string): boolean {
  const tokens = enName.toLowerCase().split(/[\s,.\-‐]+/).filter((t) => t.length > 1);
  const low = text.toLowerCase();
  return tokens.length >= 2 && tokens.every((t) => low.includes(t));
}

export type LabPageQuery = {
  name: string; // 영문 (OpenAlex)
  institution: string; // 영문
  institutionKo: string | null;
  items: { label: string; keywords_ko: string[]; keywords_en: string[] }[];
};

const OFFICIAL = /\.(ac|re)\.kr|\.edu|kaist|postech|unist|dgist|gist/i;
const EXCLUDED =
  /researchgate|linkedin|scholar\.google|orcid|openalex|semanticscholar|doi\.org|sciencedirect|springer|wiley|ieee|mdpi|dbpia|kci\.go/i;

/** 후보 한 명의 연구실 홈페이지. 그 사람이 주인공인 페이지라고 확인되지 않으면 null */
export async function findLabPage(q: LabPageQuery): Promise<LabPage | null> {
  if (!exaEnabled()) return null;
  const query = `${q.name} ${q.institution}${q.institutionKo ? ` ${q.institutionKo}` : ""} 연구실 lab homepage professor`;
  const results = await exaSearch({
    query,
    type: "auto",
    numResults: 6,
    contents: { text: { maxCharacters: 12000 } },
  });

  // 다른 교수 연구실 페이지의 논문 목록에 이름이 나오는 경우를 거른다:
  // 이름이 제목이나 페이지 앞부분(1500자)에 있어야 한다
  let best: { r: ExaResult; score: number; koName: string | null } | null = null;
  for (const r of results) {
    if (!r.text || EXCLUDED.test(r.url)) continue;
    const title = r.title ?? "";
    const head = `${title}\n${r.text.slice(0, 1500)}`;
    const koName = findKoreanName(r.text.slice(0, 3000), q.name);
    let score = 0;
    if (mentionsName(title, q.name) || (koName && title.includes(koName))) score += 3;
    if (mentionsName(head, q.name)) score += 2;
    if (koName) score += 2;
    if (score < 2) continue;
    if (OFFICIAL.test(r.url)) score += 1;
    if (!best || score > best.score) best = { r, score, koName };
  }
  if (!best) return null;

  const text = best.r.text ?? "";
  const equipment = q.items.flatMap((it) => {
    const snippet = snippetAround(text, [...it.keywords_ko, ...it.keywords_en, it.label]);
    return snippet ? [{ label: it.label, snippet }] : [];
  });
  return { url: best.r.url, title: best.r.title ?? best.r.url, koName: best.koName, equipment };
}
