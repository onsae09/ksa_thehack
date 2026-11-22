import { runSearch } from "@/lib/pipeline";
import type { SearchInput, SearchResult } from "@/lib/types";

export const maxDuration = 60;

// 같은 입력은 인스턴스가 살아 있는 동안 재사용 (데모 중 반복 호출 대비)
const cache = new Map<string, SearchResult>();

export async function POST(req: Request) {
  let input: SearchInput;
  try {
    const body = await req.json();
    input = {
      question: String(body.question ?? "").trim(),
      methods: Array.isArray(body.methods) ? body.methods.map(String) : [],
      equipment: String(body.equipment ?? ""),
      region: body.region ? String(body.region) : undefined,
    };
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (input.question.length < 5) {
    return Response.json({ error: "연구 질문을 조금 더 구체적으로 적어 주세요." }, { status: 400 });
  }
  if (input.methods.length === 0) {
    return Response.json({ error: "쓰려는 방법을 하나 이상 골라 주세요." }, { status: 400 });
  }

  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return Response.json(hit);

  try {
    const result = await runSearch(input);
    cache.set(key, result);
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
