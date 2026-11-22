import { runSearch } from "@/lib/pipeline";
import { cacheKey, readCache, writeCache } from "@/lib/diskcache";
import type { SearchInput, SearchProgressEvent, SearchResult } from "@/lib/types";

export const maxDuration = 60;

// 같은 입력은 같은 결과: 메모리 → 파일(.cache/search) 순으로 재사용. body.fresh=true면 새로 검색해 덮어쓴다
// fresh여도 입력 정리(검색어 만들기)는 같은 입력이면 저장본을 다시 쓴다 (순위가 실행마다 흔들리지 않게).
// body.renormalize=true면 검색어도 새로 만든다 (평가·실험용)
const cache = new Map<string, SearchResult>();
const NS = "search-v2"; // 결과 형식이 바뀌면 올려서 예전 캐시를 버린다

export async function POST(req: Request) {
  let input: SearchInput;
  let fresh = false;
  let stream = false;
  let renormalize = false;
  try {
    const body = await req.json();
    input = {
      question: String(body.question ?? "").trim(),
      methods: Array.isArray(body.methods) ? body.methods.map(String) : [],
      equipment: String(body.equipment ?? ""),
      data: body.data ? String(body.data) : undefined,
      region: body.region ? String(body.region) : undefined,
    };
    fresh = body.fresh === true || body.renormalize === true;
    renormalize = body.renormalize === true;
    stream = body.stream === true; // true: 진행 이벤트를 한 줄씩(NDJSON) 보내고 마지막 줄에 결과
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
    ...(input.data?.trim() ? { d: input.data.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean).join(",") } : {}),
  });
  if (!fresh) {
    const hit = cache.get(key) ?? (await readCache<SearchResult>(NS, key))?.value;
    if (hit) {
      cache.set(key, hit);
      return stream ? ndjson(async (send) => send({ type: "result", result: hit })) : Response.json(hit);
    }
  }

  const search = async (onProgress?: (e: SearchProgressEvent) => void) => {
    const result = await runSearch(input, onProgress, { freshNormalize: renormalize });
    // 저장본에는 처음 검색한 시각을 담는다 (다음 요청에서 "저장된 결과" 표시용). 이번 응답에는 없음
    const saved: SearchResult = { ...result, cachedAt: new Date().toISOString() };
    await writeCache(NS, key, saved);
    cache.set(key, saved);
    return result;
  };

  if (stream) {
    return ndjson(async (send) => {
      try {
        const result = await search((e) => send({ type: "progress", ...e }));
        send({ type: "result", result });
      } catch (e) {
        console.error(e);
        send({ type: "error", error: "검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }); // 원문은 서버 로그에만
      }
    });
  }

  try {
    return Response.json(await search());
  } catch (e) {
    console.error(e);
    return Response.json({ error: "검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

/** 한 줄에 JSON 하나씩 흘려보내는 응답. 프록시가 모아두지 않게 버퍼링을 끈다 */
function ndjson(run: (send: (obj: unknown) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        await run(send);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
