/**
 * NTIS(국가과학기술지식정보서비스) 비공식 어댑터 — 해커톤 시연용
 *
 * - 과제 검색: GET /ThSearchProjectList.do?searchWord=…&sort=RANK/DESC&pageSize=50 (로그인 없음, 서버가 그린 HTML)
 *   목록 한 줄에 과제명·과제번호·사업연도·기간·사업명·연구책임자(한글)·수행기관·부처·연구비가 있다.
 * - 과제 상세(pjtInfo.do)는 로그인이 필요해서 쓰지 않는다. 목록만 쓴다.
 *
 * 원칙: 실패하면 조용히 빠진다. 같은 검색은 캐시한다.
 */
import type { NtisProject } from "./types";

const BASE = "https://www.ntis.go.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT = 10000;

const cache = new Map<string, Omit<NtisProject, "similarity">[]>();

function text(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 한 페이지(최대 50건) 과제 검색. 정확도순 */
export async function searchProjects(query: string): Promise<Omit<NtisProject, "similarity">[]> {
  const hit = cache.get(query);
  if (hit) return hit;
  const params = new URLSearchParams({ searchWord: query, sort: "RANK/DESC", pageSize: "50", pageNumber: "1" });
  const res = await fetch(`${BASE}/ThSearchProjectList.do?${params}`, {
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`NTIS ${res.status}`);
  const html = await res.text();

  const out: Omit<NtisProject, "similarity">[] = [];
  for (const raw of html.split('class="listType originPjt"').slice(1)) {
    const block = raw.split('class="listType subproject"')[0]; // 아래에 붙은 다른 연차는 버린다
    const link = block.match(/href="([^"]*pjtInfo\.do\?pjtId=(\d+)[^"]*)"[^>]*class="announce subject-txt"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const info = block.slice(block.indexOf('class="info-txt"'));
    const spans = [...info.matchAll(/<span class="txt( periodYr)?"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => ({
      period: !!m[1],
      raw: m[2],
      text: text(m[2]),
    }));
    const piIdx = spans.findIndex((s) => s.raw.includes("hrstKOI") || s.raw.includes("selectDetailInfo"));
    if (piIdx < 0) continue; // 연구책임자 없는 과제는 쓸 수 없다
    const plain = spans.filter((s) => !s.period);
    const periodSpan = spans.find((s) => s.period)?.text ?? "";
    const yearSpan = plain.find((s) => /^\d{4}$/.test(s.text));
    const piPos = plain.findIndex((s) => s.raw.includes("hrstKOI") || s.raw.includes("selectDetailInfo"));
    const fundingText = (plain[piPos + 3]?.text ?? "").replace(/,/g, ""); // 클라이언트에 따라 "960,000,000" 또는 "960000000"
    out.push({
      id: link[2],
      title: text(link[3]),
      year: Number(yearSpan?.text ?? 0),
      period: periodSpan.split("▦")[0]?.trim() || null,
      program: plain[piPos - 1]?.text ?? "",
      pi: plain[piPos]?.text ?? "",
      organ: plain[piPos + 1]?.text ?? "",
      ministry: plain[piPos + 2]?.text ?? "",
      funding: Number(fundingText.match(/^(\d+)/)?.[1] ?? NaN) || null,
      url: `${BASE}/project/pjtInfo.do?pjtId=${link[2]}&pageCode=TH_PJT_PJT_DTL`,
    });
  }
  cache.set(query, out);
  return out;
}

/** 대학·연구기관만 (기업·개인 과제 제외) */
export function isResearchOrgan(organ: string): boolean {
  if (/\(주\)|주식회사|㈜|\(유\)|유한회사|협동조합/.test(organ)) return false;
  return /대학|연구원|연구소|과학기술원|KAIST|UNIST|DGIST|GIST|POSTECH|연구센터|병원|진흥원|테크노파크/.test(organ);
}
