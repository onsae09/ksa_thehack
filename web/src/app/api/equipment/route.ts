import { cached } from "@/lib/diskcache";
import { lookupEquipment, type EquipmentRequest, type EquipmentResult } from "@/lib/equipment";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const input: EquipmentRequest = {
    items: Array.isArray(body?.items)
      ? body.items.map((i: { label?: unknown; inferred?: unknown }) => ({ label: String(i?.label ?? "").trim(), inferred: Boolean(i?.inferred) })).filter((i: { label: string }) => i.label)
      : [],
    institutions: Array.isArray(body?.institutions)
      ? body.institutions.map((i: { id?: unknown; name?: unknown }) => ({ id: String(i?.id ?? ""), name: String(i?.name ?? "") }))
      : [],
    names: Array.isArray(body?.names) ? body.names.map(String) : [],
    candidates: Array.isArray(body?.candidates)
      ? body.candidates.map((c: Record<string, unknown>) => ({
          authorId: String(c?.authorId ?? ""),
          name: String(c?.name ?? ""),
          institutionId: String(c?.institutionId ?? ""),
        }))
      : [],
  };
  if (input.items.length === 0) return Response.json({ error: "장비 항목이 없습니다." }, { status: 400 });

  try {
    const result = await cached("equipment-v1", input, () => lookupEquipment(input), (r) => r.status === "ok");
    return Response.json(result);
  } catch (e) {
    console.error("[equipment]", e instanceof Error ? e.message : e);
    return Response.json({ status: "failed", items: [], byInstitution: {}, byName: {}, byCandidate: {} } satisfies EquipmentResult);
  }
}
