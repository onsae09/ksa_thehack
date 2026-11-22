import { lookupAdvisor, rankAgainst, type AdvisorRequest, type AdvisorResult } from "@/lib/advisor";
import { cached } from "@/lib/diskcache";
import type { CheckItem } from "@/lib/types";

export const maxDuration = 60;

const str = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 80)).slice(0, 20) : []);

/**
 * 제안서의 연락 예정 교수를 OpenAlex에서 찾아 검색 후보와 같은 방식으로 점수·근거를 매긴다.
 * 순위에는 넣지 않고, 검색 책임저자 점수(scores)와 비교한 자리만 돌려준다.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const items: CheckItem[] = (Array.isArray(body?.items) ? body.items : []).slice(0, 12).map((i: Record<string, unknown>) => ({
    label: str(i?.label, 60),
    kind: (["method", "equipment", "data"].includes(String(i?.kind)) ? i?.kind : "method") as CheckItem["kind"],
    inferred: i?.inferred === true,
    keywords_en: strs(i?.keywords_en),
    keywords_ko: strs(i?.keywords_ko),
  }));
  const input: AdvisorRequest = {
    name: str(body?.name, 40),
    name_en: str(body?.name_en, 80),
    affiliation: str(body?.affiliation, 120),
    query_en: str(body?.query_en, 1000),
    method_query_en: str(body?.method_query_en, 1000),
    items,
  };
  const scores = Array.isArray(body?.scores) ? body.scores.map(Number).filter(Number.isFinite).slice(0, 2000) : undefined;
  if (!input.name && !input.name_en) return Response.json({ error: "교수 이름이 필요합니다." }, { status: 400 });
  if (!input.query_en || !input.method_query_en) return Response.json({ error: "검색 결과의 질문 정리가 필요합니다." }, { status: 400 });

  try {
    const core = await cached("advisor-v1", input, () => lookupAdvisor(input), (r) => r.status !== "not_found" || r.caveats.length > 0);
    const result: AdvisorResult = { ...core, ...rankAgainst(core, scores) };
    return Response.json(result);
  } catch (e) {
    console.error("[advisor]", e instanceof Error ? e.message : e);
    return Response.json({ error: "연락 예정 교수 조회에 실패했습니다." }, { status: 502 });
  }
}
