/**
 * 지도교수 후보에게 보낼 메일의 "첫 문단" 초안.
 * - Claude는 원문에서 인용할 구절을 고르고, 내 연구와의 연결을 한 문장씩 쓴다.
 * - 인용이 실제로 원문(초록·근거 문장)에 있는지 코드가 부분 문자열로 검사하고, 통과한 인용만 문단에 넣는다.
 * - 이름·학교는 [ ] 자리표시로 남긴다 (학생이 채운다).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { cacheKey, readCache, writeCache } from "@/lib/diskcache";
import { quoteInSource } from "@/lib/quotes";

export const maxDuration = 60;

const client = new Anthropic();
const NS = "draft-v3";

/** 인용 후보 원문 하나 (논문 초록 또는 근거 문장) */
export type DraftSource = { title: string; url: string; text: string };

export type DraftRequest = {
  question: string;
  name: string;
  /** 받는 사람 표기 (예: 연구실 페이지의 한글 이름). 없으면 name */
  displayName?: string;
  institution: string;
  sources: DraftSource[];
};

export type DraftQuote = {
  quote: string;
  connection: string; // 내 연구와 어떻게 이어지는지 (한국어 한 문장)
  title: string;
  url: string;
};

export type DraftResult = {
  paragraph: string; // 확인된 인용만으로 만든 첫 문단
  quotes: DraftQuote[]; // 원문에서 확인된 인용
  dropped: number; // 원문에 없어서 뺀 인용 수
};

const Schema = z.object({
  intro: z.string(),
  quotes: z.array(z.object({ source: z.number().int(), quote: z.string(), connection: z.string() })),
  ask: z.string(),
});

const SYSTEM = `You help a Korean high-school student write the FIRST PARAGRAPH of a polite email to a professor, asking whether the professor could advise their R&E (research & education) project.

You get the student's research question and numbered SOURCES (the professor's paper abstracts or sentences from them).

Return:
- intro: ONE Korean sentence (존댓말) introducing the student and the research question. Use the placeholders "[이름]" and "[학교]" exactly; do not invent a name or school.
- quotes: 1 to 3 items. Each item:
  - source: the number of the SOURCE the quote comes from
  - quote: a span COPIED CHARACTER-FOR-CHARACTER from that SOURCE (6-35 words, original language, no "..." and no edits). It must say something concrete about the method, equipment or finding that relates to the student's question.
  - connection: ONE Korean sentence (존댓말) saying how that point relates to the student's question. Mention only facts stated in the quote or its SOURCE (no added equipment, places or results). Do not exaggerate; do not claim the student has read the whole paper.
  Prefer quotes from different sources. Never quote something that is not in the SOURCES.
- ask: ONE or TWO Korean sentences politely asking whether the professor could give advice or guidance for the R&E project. No flattery beyond one short phrase.`;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<DraftRequest> | null;
  const question = String(body?.question ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const institution = String(body?.institution ?? "").trim();
  const displayName = String(body?.displayName ?? "").trim() || name;
  const sources: DraftSource[] = (Array.isArray(body?.sources) ? body.sources : [])
    .map((s) => ({ title: String(s?.title ?? ""), url: String(s?.url ?? ""), text: String(s?.text ?? "").slice(0, 3000) }))
    .filter((s) => s.text.length > 30)
    .slice(0, 6);
  if (!question || !name) return Response.json({ error: "연구 질문과 교수 이름이 필요합니다." }, { status: 400 });
  if (sources.length === 0) return Response.json({ error: "인용할 논문 원문이 없습니다." }, { status: 400 });

  const key = cacheKey({ question, name, displayName, institution, sources });
  const hit = await readCache<DraftResult>(NS, key);
  if (hit) return Response.json(hit.value);

  try {
    const user = [
      `학생의 연구 질문: ${question}`,
      `교수: ${name} (${institution || "소속 미상"})`,
      "",
      ...sources.map((s, i) => `SOURCE ${i + 1} — ${s.title}\n${s.text}`),
    ].join("\n");
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("no output");
    const out = res.parsed_output;

    const quotes: DraftQuote[] = [];
    let dropped = 0;
    for (const q of out.quotes.slice(0, 3)) {
      const src = sources[q.source - 1];
      // 다른 SOURCE 번호를 잘못 댄 경우도 있어 전체에서 한 번 더 찾는다
      const found = src && quoteInSource(q.quote, src.text) ? src : sources.find((s) => quoteInSource(q.quote, s.text));
      if (!found || quotes.some((x) => x.quote === q.quote)) {
        dropped++;
        continue;
      }
      quotes.push({ quote: q.quote.trim(), connection: q.connection.trim(), title: found.title, url: found.url });
    }

    // 같은 논문을 두 번 인용하면 제목을 반복하지 않는다. 인용 끝 문장부호(. , ; :)는 "…라는" 앞에서 뺀다
    const body = quotes.map((q, i) => {
      const text = q.quote.replace(/[\s.。,，;:]+$/, "");
      const where = quotes.slice(0, i).some((x) => x.url === q.url) ? "같은 논문의" : `교수님의 논문 「${q.title}」에서`;
      return `${where} “${text}”라는 부분을 읽었습니다. ${q.connection}`;
    });
    const paragraph = [`${displayName} 교수님께,`, "", [out.intro.trim(), ...body, out.ask.trim()].join(" ")].join("\n");
    const result: DraftResult = { paragraph, quotes, dropped };
    await writeCache(NS, key, result);
    return Response.json(result);
  } catch (e) {
    console.error("[draft]", e instanceof Error ? e.message : e);
    return Response.json({ error: "초안 작성에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
