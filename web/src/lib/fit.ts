/**
 * "왜 맞는가 / 빈틈" 분석. 이미 모은 근거(초록 문장, 본문 문장, 연구실 페이지, ZEUS·NTIS, 논문 제목)만 쓴다.
 *
 * - Claude는 근거 원문(SOURCE)에서 인용할 구절을 고르고, 그 구절이 말하는 점을 한국어로 짧게 쓴다.
 * - 인용이 그 후보의 SOURCE에 실제로 있는지 코드가 부분 문자열로 검사하고, 통과한 점만 남긴다 (/api/draft와 같은 방식).
 * - 빈틈은 (a) 어디에서도 근거를 못 찾은 요구 항목(코드가 계산한 목록) 또는 (b) 인용으로 뒷받침되는 한계만 남긴다.
 * - 공동 지도 조합도 역할마다 인용이 확인된 것만 남기고, 둘 이상 남지 않으면 "근거 부족"으로 돌려준다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { checkFullText, type FullTextItemIn } from "./fulltext";
import { normQuote, quoteInSource } from "./quotes";

const client = new Anthropic();

export type FitSourceKind = "abstract" | "fulltext" | "lab" | "ntis" | "zeus" | "title";

export type FitSource = { kind: FitSourceKind; title: string; url: string; text: string };

export type FitCandidateIn = {
  authorId: string;
  name: string;
  displayName: string; // 화면 표기 (한글 이름 있으면 함께)
  institution: string;
  /** "3위" 또는 "제안서의 연락 예정 교수" */
  role: string;
  papers: { id: string; title: string; url: string }[];
  sources: FitSource[];
  /** 화면 쪽 출처(초록·연구실·ZEUS)에서 이미 근거가 확인된 요구 항목 */
  covered: string[];
};

export type FitRequest = { question: string; items: FullTextItemIn[]; candidates: FitCandidateIn[] };

export type FitPoint = { point: string; quote: string; kind: FitSourceKind; title: string; url: string };
export type FitGap = { point: string; item: string | null; quote: FitPoint | null };

export type FitCandidate = {
  authorId: string;
  fits: FitPoint[];
  gaps: FitGap[];
  /** 어디에서도 근거를 못 찾은 요구 항목 (코드 계산) */
  missing: string[];
  dropped: number; // 인용이 원문에 없어서 뺀 점 수
  fulltextChecked: number; // 본문까지 읽은 논문 수
};

export type FitCombo =
  | { status: "ok"; roles: { authorId: string; name: string; role: string; evidence: FitPoint }[]; note: string | null }
  | { status: "insufficient"; reason: string };

export type FitResult = { status: "ok" | "failed"; candidates: Record<string, FitCandidate>; combo: FitCombo | null; dropped: number };

const Schema = z.object({
  candidates: z.array(
    z.object({
      candidate: z.number().int(),
      fits: z.array(z.object({ point: z.string(), source: z.number().int(), quote: z.string() })),
      gaps: z.array(z.object({ point: z.string(), missing_item: z.string().nullable(), source: z.number().int().nullable(), quote: z.string().nullable() })),
    }),
  ),
  combo: z.object({
    possible: z.boolean(),
    roles: z.array(z.object({ candidate: z.number().int(), role: z.string(), source: z.number().int(), quote: z.string() })),
    insufficient_reason: z.string(),
  }),
});

const SYSTEM = `You help a Korean high-school student judge which professors could advise their R&E research project.

You get the student's research question, the required methods/equipment, and for each CANDIDATE a numbered list of SOURCES. The SOURCES are the only evidence you may use: sentences from the professor's paper abstracts and full texts, paper titles, their lab homepage, Korean national R&D project titles (NTIS) and national equipment registry entries (ZEUS). Do not use outside knowledge about any professor, even if you recognise the name.

For EACH candidate return:
- candidate: the CANDIDATE number.
- fits: 1-3 concrete reasons this lab fits the student's question or methods. Each has:
  - point: ONE short Korean sentence (해요체 or 명사형, max ~60 characters) naming the specific overlap (e.g. "난류 속 OAM 빔 전파를 직접 다뤘음").
  - source: the SOURCE number (within this candidate) the quote comes from.
  - quote: a span COPIED CHARACTER-FOR-CHARACTER from that SOURCE (5-30 words, original language, no "..." and no edits) that shows the point.
  Only include a fit when a SOURCE really shows it. Fewer is better than weak.
- gaps: 0-3 honest weaknesses. Each has point (ONE short Korean sentence) and EITHER
  - missing_item: a label copied exactly from that candidate's "NOT FOUND" list (an item no source mentions), with source and quote null, OR
  - source + quote (copied exactly, as above) when a SOURCE shows a limitation (e.g. the work is purely theoretical, or a different wavelength regime), with missing_item null.
  Never claim the professor cannot do something; say the evidence was not found.

combo: one suggested co-advising combination across candidates, ONLY if the sources support it (e.g. one lab for the topic, another for the measurement technique).
- possible: false if the sources do not support a sensible split.
- roles: 2-3 items when possible (else empty). Each: candidate number, role (short Korean phrase like "주제(난류 속 위상 특이점) 지도"), source + quote (copied exactly from that candidate's SOURCES) proving that role.
- insufficient_reason: when possible is false, ONE Korean sentence why; otherwise "".`;

/** 인용 검사: 4낱말 이상 부분 문자열, 또는 짧은 SOURCE(과제명·장비명) 전체 */
function verified(quote: string, text: string): boolean {
  if (quoteInSource(quote, text)) return true;
  const q = normQuote(quote).replace(/^["']|["'.,;:]+$/g, "");
  return q.length >= 6 && normQuote(text).replace(/[.,;:]+$/, "") === q;
}

function findSource(c: FitCandidateIn, sourceNo: number | null, quote: string): FitSource | null {
  const s = sourceNo ? c.sources[sourceNo - 1] : undefined;
  if (s && verified(quote, s.text)) return s;
  // 다른 SOURCE 번호를 잘못 댄 경우: 같은 후보의 SOURCE 전체에서 한 번 더 찾는다 (다른 후보 것은 안 됨)
  return c.sources.find((x) => verified(quote, x.text)) ?? null;
}

/** 본문(오픈액세스 PDF) 근거를 SOURCE에 더한다. 서버 캐시를 같이 써서 화면의 본문 확인과 같은 결과 */
async function addFullText(c: FitCandidateIn, items: FullTextItemIn[]): Promise<{ sources: FitSource[]; covered: string[]; checked: number }> {
  try {
    const r = await checkFullText(c.authorId, c.papers, items);
    const hits = r.items.filter((i) => i.hit);
    const seen = new Set(c.sources.map((s) => s.text));
    const extra: FitSource[] = [];
    for (const it of hits) {
      const h = it.hit!;
      if (seen.has(h.sentence)) continue;
      seen.add(h.sentence);
      extra.push({ kind: "fulltext", title: `${h.paperTitle} (본문 p.${h.page})`, url: h.url, text: h.sentence });
    }
    return { sources: [...c.sources, ...extra], covered: hits.map((i) => i.label), checked: r.papers.filter((p) => p.status === "checked").length };
  } catch {
    return { sources: c.sources, covered: [], checked: 0 };
  }
}

export async function analyzeFit(req: FitRequest): Promise<FitResult> {
  const withFull = await Promise.all(
    req.candidates.map(async (c) => {
      const f = await addFullText(c, req.items);
      const covered = new Set([...c.covered, ...f.covered]);
      const missing = req.items.map((i) => i.label).filter((l) => !covered.has(l));
      return { c: { ...c, sources: f.sources.slice(0, 24) }, missing, checked: f.checked };
    }),
  );

  const user = [
    `학생의 연구 질문: ${req.question}`,
    `필요한 방법·장비: ${req.items.map((i) => i.label).join(", ")}`,
    "",
    ...withFull.map(({ c, missing }, i) =>
      [
        `=== CANDIDATE ${i + 1}: ${c.displayName} (${c.institution || "소속 미상"}) — ${c.role}`,
        `NOT FOUND (no source mentions these): ${missing.length ? missing.map((m) => `"${m}"`).join(", ") : "(none)"}`,
        ...c.sources.map((s, j) => `SOURCE ${j + 1} [${s.kind}] ${s.title}\n${s.text}`),
      ].join("\n"),
    ),
  ].join("\n");

  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(Schema) },
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`no output (${res.stop_reason})`);
  const out = res.parsed_output;

  let dropped = 0;
  const point = (src: FitSource, quote: string, text: string): FitPoint => ({
    point: text.trim(),
    quote: quote.trim(),
    kind: src.kind,
    title: src.title,
    url: src.url,
  });

  const candidates: Record<string, FitCandidate> = {};
  withFull.forEach(({ c, missing, checked }) => {
    candidates[c.authorId] = { authorId: c.authorId, fits: [], gaps: [], missing, dropped: 0, fulltextChecked: checked };
  });
  for (const o of out.candidates) {
    const w = withFull[o.candidate - 1];
    if (!w) continue;
    const target = candidates[w.c.authorId];
    for (const f of o.fits.slice(0, 3)) {
      const src = findSource(w.c, f.source, f.quote);
      if (!src || target.fits.some((x) => x.quote === f.quote.trim())) {
        target.dropped++;
        continue;
      }
      target.fits.push(point(src, f.quote, f.point));
    }
    for (const g of o.gaps.slice(0, 3)) {
      if (g.missing_item && w.missing.includes(g.missing_item.trim())) {
        target.gaps.push({ point: g.point.trim(), item: g.missing_item.trim(), quote: null });
        continue;
      }
      const src = g.quote ? findSource(w.c, g.source, g.quote) : null;
      if (src && g.quote) target.gaps.push({ point: g.point.trim(), item: null, quote: point(src, g.quote, g.point) });
      else target.dropped++;
    }
    dropped += target.dropped;
  }

  let combo: FitCombo;
  const roles: Extract<FitCombo, { status: "ok" }>["roles"] = [];
  for (const r of out.combo.roles.slice(0, 3)) {
    const w = withFull[r.candidate - 1];
    const src = w && findSource(w.c, r.source, r.quote);
    if (!w || !src || roles.some((x) => x.authorId === w.c.authorId)) {
      dropped++;
      continue;
    }
    roles.push({ authorId: w.c.authorId, name: w.c.displayName, role: r.role.trim(), evidence: point(src, r.quote, r.role) });
  }
  if (out.combo.possible && roles.length >= 2) {
    combo = { status: "ok", roles, note: roles.length < out.combo.roles.length ? "원문에서 확인되지 않은 역할은 뺐습니다." : null };
  } else {
    combo = {
      status: "insufficient",
      reason: !out.combo.possible
        ? out.combo.insufficient_reason.trim() || "모은 근거만으로는 역할을 나눌 만한 조합이 보이지 않습니다."
        : "제안된 조합의 근거 인용이 원문에서 확인되지 않아 보여주지 않습니다.",
    };
  }
  return { status: "ok", candidates, combo, dropped };
}
