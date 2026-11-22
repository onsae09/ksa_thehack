import { cached } from "@/lib/diskcache";
import { exaEnabled, findLabPage } from "@/lib/exa";
import { koreanInstitutionNames } from "@/lib/kornames";
import type { LabPage, LabPagesResult } from "@/lib/types";

export const maxDuration = 60;

type Body = {
  candidates?: { authorId?: unknown; name?: unknown; institution?: unknown; institutionId?: unknown }[];
  items?: { label?: unknown; keywords_ko?: unknown; keywords_en?: unknown }[];
};

const strs = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

/** 화면에 보이는 상위 후보(최대 5명)의 연구실 홈페이지를 Exa로 찾아 확인한다 */
export async function POST(req: Request) {
  if (!exaEnabled()) return Response.json({ status: "disabled", byCandidate: {} } satisfies LabPagesResult);
  const body = (await req.json().catch(() => null)) as Body | null;
  const candidates = (body?.candidates ?? []).slice(0, 5).map((c) => ({
    authorId: String(c?.authorId ?? ""),
    name: String(c?.name ?? ""),
    institution: String(c?.institution ?? ""),
    institutionId: String(c?.institutionId ?? ""),
  }));
  const items = (body?.items ?? []).map((i) => ({
    label: String(i?.label ?? ""),
    keywords_ko: strs(i?.keywords_ko),
    keywords_en: strs(i?.keywords_en),
  }));
  if (candidates.length === 0) return Response.json({ status: "ok", byCandidate: {} } satisfies LabPagesResult);

  try {
    const result = await cached("labpages-v1", { candidates, items }, () => findAll(candidates, items), (r) => r.status === "ok");
    return Response.json(result);
  } catch (e) {
    console.error("[labpages]", e instanceof Error ? e.message : e);
    return Response.json({ status: "failed", byCandidate: {} } satisfies LabPagesResult);
  }
}

type Cand = { authorId: string; name: string; institution: string; institutionId: string };
type Item = { label: string; keywords_ko: string[]; keywords_en: string[] };

async function findAll(candidates: Cand[], items: Item[]): Promise<LabPagesResult> {
  const koInst = await koreanInstitutionNames(candidates.map((c) => c.institutionId));
  const settled = await Promise.allSettled(
    candidates.map((c) =>
      findLabPage({ name: c.name, institution: c.institution, institutionKo: koInst.get(c.institutionId) ?? null, items }),
    ),
  );
  if (settled.every((s) => s.status === "rejected")) {
    console.error("[labpages]", settled[0].status === "rejected" ? settled[0].reason : "");
    return { status: "failed", byCandidate: {} };
  }
  const byCandidate: Record<string, LabPage> = {};
  settled.forEach((s, i) => {
    if (s.status === "fulfilled" && s.value) byCandidate[candidates[i].authorId] = s.value;
  });
  return { status: "ok", byCandidate };
}
