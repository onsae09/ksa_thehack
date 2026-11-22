import { cached } from "@/lib/diskcache";
import { lookupProjects, type ProjectsRequest } from "@/lib/projects";
import type { ProjectsResult } from "@/lib/types";

export const maxDuration = 60;

const FAILED: ProjectsResult = { status: "failed", projects: [], byCandidate: {}, byDomestic: {}, others: [] };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const input: ProjectsRequest = {
    question: String(body?.question ?? "").trim(),
    queries: Array.isArray(body?.queries) ? body.queries.map(String) : [],
    candidates: Array.isArray(body?.candidates)
      ? body.candidates.map((c: Record<string, unknown>) => ({
          authorId: String(c?.authorId ?? ""),
          name: String(c?.name ?? ""),
          institutionId: String(c?.institutionId ?? ""),
        }))
      : [],
    names: Array.isArray(body?.names) ? body.names.map(String) : [],
  };
  if (!input.question) return Response.json({ error: "연구 질문이 필요합니다." }, { status: 400 });

  try {
    const result = await cached("projects-v1", input, () => lookupProjects(input), (r) => r.status === "ok");
    return Response.json(result);
  } catch (e) {
    console.error("[projects]", e instanceof Error ? e.message : e);
    return Response.json(FAILED);
  }
}
