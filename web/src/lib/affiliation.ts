/**
 * 현재 소속 확인. 후보의 소속은 논문 한 편에서 왔으므로, OpenAlex 저자 기록의 기관별 연도(affiliations)로 다시 본다.
 * - current: 이 기관 소속 마지막 기록이 최근 2년 이내
 * - stale: 그보다 오래됨 → 이동·은퇴 가능성 (다른 기관의 더 최근 기록이 있으면 note에 적는다)
 * - unknown: 기록 없음 또는 조회 실패
 * OpenAlex는 동명이인 기록이 섞이는 일이 있어(예: 한국 교수 기록에 중국 기관) 순위에는 쓰지 않고 표시만 한다.
 */
import type { AffiliationCheck } from "./types";

type OAAffiliation = { institution: { id: string; display_name: string; country_code: string | null }; years: number[] };

const UNKNOWN: AffiliationCheck = { status: "unknown", lastYear: null, note: null };

export async function checkAffiliations(
  people: { authorId: string; institutionId: string }[],
): Promise<Map<string, AffiliationCheck>> {
  const out = new Map<string, AffiliationCheck>();
  if (people.length === 0) return out;
  try {
    const params = new URLSearchParams({
      filter: `id:${[...new Set(people.map((p) => p.authorId))].join("|")}`,
      select: "id,affiliations",
      per_page: "50",
    });
    if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
    const res = await fetch(`https://api.openalex.org/authors?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    const data = (await res.json()) as { results: { id: string; affiliations: OAAffiliation[] | null }[] };
    const byAuthor = new Map(data.results.map((r) => [r.id.replace("https://openalex.org/", ""), r.affiliations ?? []]));
    const now = new Date().getFullYear();

    for (const p of people) {
      const affs = byAuthor.get(p.authorId);
      const here = affs?.find((a) => a.institution.id.replace("https://openalex.org/", "") === p.institutionId);
      if (!affs || !here || here.years.length === 0) {
        out.set(p.authorId, UNKNOWN);
        continue;
      }
      const lastYear = Math.max(...here.years);
      if (lastYear >= now - 2) {
        out.set(p.authorId, { status: "current", lastYear, note: null });
        continue;
      }
      // 이 기관 이후의 다른 기관 기록 (한국 기관 우선)
      const later = affs
        .filter((a) => a !== here && Math.max(...a.years) > lastYear)
        .sort(
          (a, b) =>
            Number(b.institution.country_code === "KR") - Number(a.institution.country_code === "KR") ||
            Math.max(...b.years) - Math.max(...a.years),
        )[0];
      out.set(p.authorId, {
        status: "stale",
        lastYear,
        note: later
          ? `${Math.max(...later.years)}년 ${later.institution.display_name} 소속 기록이 있습니다`
          : `${lastYear}년 이후 이 기관 소속 논문 기록이 없습니다`,
      });
    }
  } catch {
    for (const p of people) if (!out.has(p.authorId)) out.set(p.authorId, UNKNOWN);
  }
  return out;
}
