/**
 * 공공데이터포털(data.go.kr) 데이터셋 검색 — 비공식, 공개 검색 화면(로그인 없음)
 *
 * 데이터 항목(예: "교통카드 승하차 데이터")을 학생이 어디서 받을 수 있는지 보여준다.
 * GET /tcs/dss/selectDataSetList.do?keyword=… → 서버가 그린 HTML. 결과 한 건: 분류·기관유형 배지, 형식 배지,
 * 제목 링크(/data/{id}/fileData.do 또는 openapi.do), 설명, 제공기관, 수정일.
 * 실패하면 조용히 빠진다. 같은 검색은 캐시한다.
 */
import type { PublicDataset } from "./types";

const BASE = "https://www.data.go.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const cache = new Map<string, { total: number; datasets: PublicDataset[] }>();

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

export function publicDataSearchUrl(keyword: string): string {
  return `${BASE}/tcs/dss/selectDataSetList.do?${new URLSearchParams({ keyword })}`;
}

/** 검색어 하나로 데이터셋 목록 (정확도순 첫 페이지) */
export async function searchDatasets(keyword: string, limit = 5): Promise<{ total: number; datasets: PublicDataset[] }> {
  const hit = cache.get(keyword);
  if (hit) return { total: hit.total, datasets: hit.datasets.slice(0, limit) };
  const params = new URLSearchParams({ keyword, currentPage: "1", perPage: "10" });
  const res = await fetch(`${BASE}/tcs/dss/selectDataSetList.do?${params}`, {
    headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`data.go.kr ${res.status}`);
  const html = await res.text();
  const total = Number(html.match(/전체\s*<span>\s*([\d,]+)\s*건/)?.[1]?.replace(/,/g, "") ?? 0);

  const datasets: PublicDataset[] = [];
  for (const block of html.split('<div class="apply-result-item">').slice(1)) {
    const link = block.match(/<a href="(\/data\/(\d+)\/(fileData|openapi)\.do)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const formats = [...block.matchAll(/<span class="krds-badge (?:file-ext-[a-z]+|bg-light-primary)"[^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => text(m[1]))
      .filter((f) => /^[A-Z+ ]+$/.test(f)); // CSV, JSON + XML 등 형식만 (기관유형 배지는 제외)
    const li = (label: string) => text(block.match(new RegExp(`<strong>${label}</strong>([\\s\\S]*?)</li>`))?.[1] ?? "");
    datasets.push({
      id: link[2],
      title: text(link[4]),
      provider: li("제공기관"),
      type: link[3] === "fileData" ? "파일" : link[3] === "openapi" ? "오픈API" : "기타",
      formats: [...new Set(formats)],
      summary: text(block.match(/class="apply-result-summary">([\s\S]*?)<\/span>/)?.[1] ?? "").slice(0, 200),
      modified: li("수정일") || null,
      url: `${BASE}${link[1]}`,
    });
  }
  cache.set(keyword, { total, datasets });
  return { total, datasets: datasets.slice(0, limit) };
}
