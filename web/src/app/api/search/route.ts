import { runSearch } from "@/lib/pipeline";
import { cacheKey, readCache, writeCache } from "@/lib/diskcache";
import type { SearchInput, SearchResult } from "@/lib/types";

export const maxDuration = 60;

// 같은 입력은 같은 결과: 메모리 → 파일(.cache/search) 순으로 재사용. body.fresh=true면 새로 검색해 덮어쓴다
const cache = new Map<string, SearchResult>();
const NS = "search-v1"; // 결과 형식이 바뀌면 올려서 예전 캐시를 버린다

export async function POST(req: Request) {
  let input: SearchInput;
  let fresh = false;
  try {
    const body = await req.json();
    input = {
      question: String(body.question ?? "").trim(),
      methods: Array.isArray(body.methods) ? body.methods.map(String) : [],
      equipment: String(body.equipment ?? ""),
      region: body.region ? String(body.region) : undefined,
    };
    fresh = body.fresh === true;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (input.question.length < 5) {
    return Response.json({ error: "연구 질문을 조금 더 구체적으로 적어 주세요." }, { status: 400 });
  }
  if (input.methods.length === 0) {
    return Response.json({ error: "쓰려는 방법을 하나 이상 골라 주세요." }, { status: 400 });
  }

  // 방법 순서·장비 칸 공백이 달라도 같은 입력으로 본다
  const key = cacheKey({
    q: input.question.replace(/\s+/g, " "),
    m: [...input.methods].sort(),
    e: input.equipment.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean).join(","),
  });
  if (!fresh) {
    const hit = cache.get(key) ?? (await readCache<SearchResult>(NS, key))?.value;
    if (hit) {
      cache.set(key, hit);
      return Response.json(hit);
    }
  }

  try {
    const result = await runSearch(input);
    // 저장본에는 처음 검색한 시각을 담는다 (다음 요청에서 "저장된 결과" 표시용). 이번 응답에는 없음
    const saved: SearchResult = { ...result, cachedAt: new Date().toISOString() };
    await writeCache(NS, key, saved);
    cache.set(key, saved);
    return Response.json(result);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "알 수 없는 오류" }, { status: 500 });
  }
}
