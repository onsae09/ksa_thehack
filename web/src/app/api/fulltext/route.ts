import { checkFullText, type FullTextItemIn, type FullTextPaperIn, type FullTextResult } from "@/lib/fulltext";

export const maxDuration = 60;

type Body = {
  authorId?: unknown;
  papers?: { id?: unknown; title?: unknown; url?: unknown }[];
  items?: { label?: unknown; keywords_en?: unknown; keywords_ko?: unknown }[];
  stream?: unknown;
};

const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).map((s) => s.slice(0, 80)).slice(0, 20) : []);

/**
 * 후보 논문의 오픈액세스 PDF 본문에서 필요한 방법·장비가 적힌 문장을 찾는다.
 * 일부 논문이 실패해도 500을 내지 않고, 논문별 상태에 그 사실을 담아 돌려준다.
 * stream: true면 진행 이벤트를 한 줄씩(NDJSON) 보내고 마지막 줄에 결과.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const authorId = String(body?.authorId ?? "").slice(0, 40);
  const papers: FullTextPaperIn[] = (Array.isArray(body?.papers) ? body.papers : []).slice(0, 10).map((p) => ({
    id: String(p?.id ?? ""),
    title: String(p?.title ?? "").slice(0, 500),
    url: String(p?.url ?? "").slice(0, 500),
  }));
  const items: FullTextItemIn[] = (Array.isArray(body?.items) ? body.items : []).slice(0, 12).map((i) => ({
    label: String(i?.label ?? "").slice(0, 60),
    keywords_en: strs(i?.keywords_en),
    keywords_ko: strs(i?.keywords_ko),
  }));
  const empty = (): FullTextResult => ({ authorId, papers: [], items: items.map((i) => ({ label: i.label, hit: null })), ms: 0 });

  if (body?.stream === true) {
    return ndjson(async (send) => {
      try {
        const result = await checkFullText(authorId, papers, items, (e) => send({ type: "progress", ...e }));
        send({ type: "result", result });
      } catch (e) {
        console.error("[fulltext]", e instanceof Error ? e.message : e);
        send({ type: "result", result: empty(), error: "본문 확인 중 오류" });
      }
    });
  }
  try {
    return Response.json(await checkFullText(authorId, papers, items));
  } catch (e) {
    console.error("[fulltext]", e instanceof Error ? e.message : e);
    return Response.json({ ...empty(), error: "본문 확인 중 오류" });
  }
}

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
