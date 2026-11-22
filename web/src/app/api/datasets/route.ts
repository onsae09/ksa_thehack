import { cached } from "@/lib/diskcache";
import { publicDataSearchUrl, searchDatasets } from "@/lib/publicdata";
import type { DatasetsResult } from "@/lib/types";

export const maxDuration = 30;

const FAILED: DatasetsResult = { status: "failed", items: [] };

/** 데이터 항목별로 공공데이터포털에서 받을 수 있는 데이터셋을 찾는다 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const items: { label: string; keywords_ko: string[] }[] = (Array.isArray(body?.items) ? body.items : [])
    .map((i: { label?: unknown; keywords_ko?: unknown }) => ({
      label: String(i?.label ?? "").trim(),
      keywords_ko: Array.isArray(i?.keywords_ko) ? i.keywords_ko.map(String) : [],
    }))
    .filter((i: { label: string }) => i.label)
    .slice(0, 4);
  if (items.length === 0) return Response.json({ status: "ok", items: [] } satisfies DatasetsResult);

  try {
    const result = await cached("datasets-v1", items, () => lookup(items), (r) => r.status === "ok");
    return Response.json(result);
  } catch (e) {
    console.error("[datasets]", e instanceof Error ? e.message : e);
    return Response.json(FAILED);
  }
}

async function lookup(items: { label: string; keywords_ko: string[] }[]): Promise<DatasetsResult> {
  const settled = await Promise.allSettled(
    items.map(async (it) => {
      // "교통카드 승하차 데이터(서울)" → 괄호·"데이터/자료" 같은 꼬리말을 뗀 검색어부터, 없으면 한국어 키워드로
      const base = it.label.replace(/\([^)]*\)/g, " ").replace(/\s*(데이터셋|데이터|자료|DB)\s*$/i, "").replace(/\s+/g, " ").trim();
      const tries = [...new Set([base, ...it.keywords_ko.filter((k) => k.length >= 2)])].filter(Boolean).slice(0, 3);
      for (const keyword of tries) {
        const r = await searchDatasets(keyword);
        if (r.total > 0) return { label: it.label, keyword, total: r.total, searchUrl: publicDataSearchUrl(keyword), datasets: r.datasets };
      }
      const keyword = tries[0] ?? it.label;
      return { label: it.label, keyword, total: 0, searchUrl: publicDataSearchUrl(keyword), datasets: [] };
    }),
  );
  if (settled.every((s) => s.status === "rejected")) return FAILED;
  return { status: "ok", items: settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])) };
}
