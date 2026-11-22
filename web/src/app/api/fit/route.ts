import { cached } from "@/lib/diskcache";
import { analyzeFit, type FitCandidateIn, type FitRequest, type FitResult, type FitSource, type FitSourceKind } from "@/lib/fit";

export const maxDuration = 120;

const NS = "fit-v1";
const KINDS: FitSourceKind[] = ["abstract", "fulltext", "lab", "ntis", "zeus", "title"];
const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const strs = (v: unknown, n = 80, max = 20) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

/** 상위 후보(+ 연락 예정 교수)의 "맞는 점 / 빈틈"과 공동 지도 조합. 이미 모은 근거만 쓰고, 인용은 원문 대조로 확인한다 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 12).map((i: Record<string, unknown>) => ({
    label: str(i?.label, 60),
    keywords_en: strs(i?.keywords_en),
    keywords_ko: strs(i?.keywords_ko),
  }));
  const candidates: FitCandidateIn[] = (Array.isArray(body?.candidates) ? body.candidates : []).slice(0, 7).map((c: Record<string, unknown>) => ({
    authorId: str(c?.authorId, 40),
    name: str(c?.name, 80),
    displayName: str(c?.displayName, 120) || str(c?.name, 80),
    institution: str(c?.institution, 160),
    role: str(c?.role, 40),
    papers: (Array.isArray(c?.papers) ? c.papers : []).slice(0, 5).map((p: Record<string, unknown>) => ({ id: str(p?.id, 80), title: str(p?.title, 400), url: str(p?.url, 400) })),
    sources: (Array.isArray(c?.sources) ? c.sources : [])
      .slice(0, 20)
      .map((s: Record<string, unknown>): FitSource => ({
        kind: (KINDS.includes(s?.kind as FitSourceKind) ? s.kind : "abstract") as FitSourceKind,
        title: str(s?.title, 300),
        url: str(s?.url, 400),
        text: str(s?.text, 2000),
      }))
      .filter((s: FitSource) => s.text.length >= 6),
    covered: strs(c?.covered, 60),
  }));
  const input: FitRequest = { question: str(body?.question, 500), items, candidates: candidates.filter((c) => c.authorId && c.sources.length) };
  if (!input.question || input.candidates.length === 0) return Response.json({ error: "연구 질문과 후보 근거가 필요합니다." }, { status: 400 });

  try {
    const result = await cached<FitResult>(NS, input, () => analyzeFit(input), (r) => r.status === "ok");
    return Response.json(result);
  } catch (e) {
    console.error("[fit]", e instanceof Error ? e.message : e);
    return Response.json({ status: "failed", candidates: {}, combo: null, dropped: 0 } satisfies FitResult);
  }
}
