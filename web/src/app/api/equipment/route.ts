import { lookupEquipment, type EquipmentRequest, type EquipmentResult } from "@/lib/equipment";

export const maxDuration = 60;

const cache = new Map<string, EquipmentResult>();

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
  };
  if (input.items.length === 0) return Response.json({ error: "장비 항목이 없습니다." }, { status: 400 });

  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  try {
    const result = await lookupEquipment(input);
    if (result.status === "ok") cache.set(key, result);
    return Response.json(result);
  } catch (e) {
    console.error("[equipment]", e instanceof Error ? e.message : e);
    return Response.json({ status: "failed", items: [], byInstitution: {}, byName: {} } satisfies EquipmentResult);
  }
}
