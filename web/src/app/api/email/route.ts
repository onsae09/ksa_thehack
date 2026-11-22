import Anthropic from "@anthropic-ai/sdk";
import { readCache, writeCache, cacheKey } from "@/lib/diskcache";

export const maxDuration = 60;

const client = new Anthropic();
const cache = new Map<string, EmailResult>();

export type EmailResult = {
  email: string | null;
  source: string | null;
  verified: boolean; // 서버가 출처 페이지를 직접 열어 이메일 문자열을 확인했는지
};

const SYSTEM = `You find the official work email address of a Korean researcher.
Search the web (university/institute faculty pages, lab homepages, department directories, ORCID, Google Scholar profile pages).
Only report an email that you actually saw written on a page you found. Never guess or construct one from a naming pattern.
After you find a candidate, open the source page with web_fetch to confirm the address is written there (try another page if that one cannot be fetched).
Prefer the institution's official domain (e.g. kaist.ac.kr, snu.ac.kr, re.kr).
End your answer with exactly one final line in this format:
EMAIL: <address> | SOURCE: <url of the page where it is written>
or, if not found:
EMAIL: NONE`;

/** 페이지 HTML에서 흔한 난독화(at/dot, [at] 등)를 풀어 이메일 문자열이 실제로 있는지 확인 */
async function verifyOnPage(email: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const html = (await res.text()).toLowerCase();
    const deob = html
      .replace(/&#64;|&#x40;/g, "@")
      .replace(/\s*[\[(]\s*at\s*[\])]\s*/g, "@")
      .replace(/\s+at\s+/g, "@")
      .replace(/\s*[\[(]\s*dot\s*[\])]\s*/g, ".")
      .replace(/\s+dot\s+/g, ".");
    const e = email.toLowerCase();
    return html.includes(e) || deob.includes(e);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const institution = String(body?.institution ?? "").trim();
  const hint = String(body?.hint ?? "").trim(); // 연구분야나 대표 논문 제목 (동명이인 구분용)
  if (!name) return Response.json({ error: "이름이 필요합니다." }, { status: 400 });

  const key = `${name}|${institution}`;
  const fileKey = cacheKey(key);
  const hit = cache.get(key) ?? (await readCache<EmailResult>("email-v1", fileKey))?.value;
  if (hit) {
    cache.set(key, hit);
    return Response.json(hit);
  }

  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `연구자: ${name}\n소속: ${institution || "(모름, 한국 대학 또는 연구소)"}\n참고(동명이인 구분용): ${hint || "-"}\n이 연구자의 공식 이메일 주소를 찾아 주세요.`,
      },
    ];
    let res: Anthropic.Message | null = null;
    // 서버 도구가 길어지면 pause_turn으로 멈출 수 있어 최대 3번 이어서 실행
    for (let i = 0; i < 3; i++) {
      res = await client.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 4000,
        system: SYSTEM,
        output_config: { effort: "low" },
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 4 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
        ],
        messages,
      });
      if (res.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: res.content });
    }
    const text = (res?.content ?? [])
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const m = text.match(/EMAIL:\s*([^\s|]+@[^\s|]+)\s*\|\s*SOURCE:\s*(\S+)/i);
    if (!m) {
      const out: EmailResult = { email: null, source: null, verified: false };
      // 모델이 끝까지 찾아보고 "없음"이라고 답한 경우만 저장. 중간에 멈췄거나 형식이 틀린 답은 일시적 실패로 보고 저장하지 않는다
      if (res?.stop_reason === "end_turn" && /EMAIL:\s*NONE/i.test(text)) {
        cache.set(key, out);
        await writeCache("email-v1", fileKey, out);
      }
      return Response.json(out);
    }
    const email = m[1].replace(/[.,;)]+$/, "");
    const source = m[2].replace(/[.,;)]+$/, "");
    // 검증 1: web_fetch 도구가 가져온 원본 페이지 내용에 그 주소가 있는가 (모델이 쓴 문장이 아니라 도구 결과를 본다)
    const fetched = messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .concat(res?.content ?? [])
      .filter((b) => b.type === "web_fetch_tool_result")
      .map((b) => JSON.stringify(b).toLowerCase())
      .join("\n");
    const inFetched = fetched.includes(email.toLowerCase());
    // 검증 2: 서버가 직접 출처 페이지를 열어 확인 (스크립트로 그리는 페이지는 실패할 수 있음)
    const out: EmailResult = { email, source, verified: inFetched || (await verifyOnPage(email, source)) };
    cache.set(key, out);
    await writeCache("email-v1", fileKey, out);
    return Response.json(out);
  } catch (e) {
    console.error("[email]", e instanceof Error ? e.message : e);
    return Response.json({ error: "이메일 검색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
