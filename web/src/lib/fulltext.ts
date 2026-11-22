/**
 * 논문 본문 확인: 후보의 논문 중 합법적인 오픈액세스 PDF(OpenAlex가 알려준 arXiv·PMC·출판사 OA 사본)만 내려받아
 * 필요한 방법·장비 키워드가 본문(가능하면 Methods/Experimental 절)에 적힌 문장을 찾는다.
 *
 * 원칙
 * - 유료 벽 우회·비공식 사본은 쓰지 않는다. OpenAlex가 is_oa로 표시한 위치의 pdf_url만 시도한다.
 * - PDF는 신뢰할 수 없는 데이터: 크기 상한·시간 제한·%PDF 확인 후 텍스트만 뽑는다 (스크립트 실행 없음, 글꼴 로드 끔).
 *   뽑은 글은 데이터일 뿐 지시가 아니다. 모델에 넘기지 않고 정규식으로 원문 문장을 고르기만 한다.
 * - 문장을 만들어내지 않는다 (pipeline.ts findEvidence와 같은 규칙). 부정 문맥("without …")은 근거로 치지 않는다.
 * - 확인한 것과 못 한 것을 논문별 상태로 돌려준다 (화면이 정직하게 말할 수 있도록).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cached } from "./diskcache";

const OPENALEX = "https://api.openalex.org";
const MAX_PAPERS = 3; // 후보 한 명당
const MAX_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 15_000;
const PARSE_TIMEOUT = 15_000;
const MAX_PAGES = 40;
const MAX_REDIRECTS = 5;
const MAX_CONCURRENT_DOWNLOADS = 4; // 서버 전체 (여러 요청이 겹쳐도)

export type FullTextPaperIn = { id: string; title?: string; url?: string };
export type FullTextItemIn = { label: string; keywords_en: string[]; keywords_ko: string[] };

export type PaperStatus = "checked" | "no_pdf" | "download_failed" | "parse_failed";

export type FullTextPaper = {
  id: string;
  title: string;
  url: string; // 논문 페이지 (DOI 우선)
  status: PaperStatus;
  pdfUrl: string | null; // 실제로 읽은(또는 시도한) PDF
  pages: number | null; // 읽은 쪽 수
  methodsFound: boolean; // Methods/Experimental 절 제목을 찾았는지
  detail: string | null; // 실패 이유 (화면 툴팁용)
};

export type FullTextHit = {
  sentence: string; // PDF에서 뽑은 원문 문장 그대로 (줄바꿈·하이픈 정리만)
  matched: string; // 근거로 잡힌 키워드 (원문 표기)
  page: number; // 1부터
  inMethods: boolean; // Methods/Experimental 절 안의 문장
  paperTitle: string;
  url: string;
  pdfUrl: string;
};

export type FullTextItem = { label: string; hit: FullTextHit | null };

export type FullTextResult = {
  authorId: string;
  papers: FullTextPaper[];
  items: FullTextItem[];
  ms: number;
};

export type FullTextProgress =
  | { stage: "lookup"; papers: number }
  | { stage: "read"; pdfs: number; done: number }; // pdfs: 공개 PDF가 있는 논문 수, done: 읽기를 마친 수

/* ───────── OpenAlex: 공개 PDF 위치 ───────── */

type OALocation = {
  is_oa?: boolean;
  pdf_url?: string | null;
  landing_page_url?: string | null;
  version?: string | null;
  source?: { display_name?: string | null } | null;
};
type OAWork = {
  id: string;
  doi: string | null;
  title: string | null;
  best_oa_location?: OALocation | null;
  primary_location?: OALocation | null;
  locations?: OALocation[] | null;
};

export function workId(id: string): string | null {
  const m = /^(?:https?:\/\/openalex\.org\/)?(W\d{3,15})$/i.exec(id.trim());
  return m ? m[1].toUpperCase() : null;
}

async function fetchWorks(ids: string[]): Promise<Map<string, OAWork>> {
  const params = new URLSearchParams({
    filter: `openalex:${ids.join("|")}`,
    select: "id,doi,title,best_oa_location,primary_location,locations",
    per_page: String(ids.length),
  });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  const res = await fetch(`${OPENALEX}/works?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  const data = (await res.json()) as { results: OAWork[] };
  return new Map(data.results.map((w) => [w.id.replace("https://openalex.org/", ""), w]));
}

/** 시도할 PDF 주소: OpenAlex가 오픈액세스로 표시한 위치만. 좋은 사본(best_oa) → 나머지 OA 위치 (NCBI PMC는 마지막) */
function pdfCandidates(w: OAWork): string[] {
  const urls: string[] = [];
  const add = (l: OALocation | null | undefined) => {
    if (l?.is_oa && l.pdf_url && /^https?:\/\//i.test(l.pdf_url)) urls.push(l.pdf_url);
  };
  add(w.best_oa_location);
  add(w.primary_location);
  for (const l of w.locations ?? []) add(l);
  // arXiv 초록 페이지만 알려준 경우 같은 논문의 arXiv PDF
  for (const l of [w.best_oa_location, ...(w.locations ?? [])]) {
    const m = l?.is_oa && l.landing_page_url ? /^https?:\/\/arxiv\.org\/abs\/([\w.\-/]+?)(v\d+)?$/i.exec(l.landing_page_url) : null;
    if (m) urls.push(`https://arxiv.org/pdf/${m[1]}`);
  }
  // NCBI PMC는 자동 요청에 확인 페이지를 자주 돌려주므로 다른 OA 사본을 먼저 시도한다 (Europe PMC PDF도 403으로 막힘, 2026-11 확인)
  const ncbi = (u: string) => /(^|\.)ncbi\.nlm\.nih\.gov$/i.test(new URL(u).hostname);
  const ordered = [...urls.filter((u) => !ncbi(u)), ...urls.filter(ncbi)];
  return [...new Set(ordered)].slice(0, 4);
}

/* ───────── 내려받기 (상한·시간 제한·주소 검사) ───────── */

let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_DOWNLOADS) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** 바깥 인터넷 주소만 (OpenAlex 데이터에 내부망 주소가 섞여 들어와도 서버 내부로 요청하지 않게) */
async function publicUrl(raw: string): Promise<URL | null | "dns"> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$/i.test(host)) return null;
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addrs.length === 0 || addrs.some((a) => privateAddress(a.address))) return null;
  } catch {
    return "dns";
  }
  return u;
}

class FetchFail extends Error {}

async function download(raw: string): Promise<Uint8Array> {
  let url = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await publicUrl(url);
    if (u === "dns") throw new FetchFail("서버 주소를 찾을 수 없음");
    if (!u) throw new FetchFail("허용하지 않는 주소");
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LabFitKR/1.0; open-access full-text check)",
        Accept: "application/pdf,*/*;q=0.5",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel();
      if (!loc) throw new FetchFail(`HTTP ${res.status}`);
      url = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new FetchFail(`HTTP ${res.status}`);
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) {
      await res.body?.cancel();
      throw new FetchFail("파일이 너무 큼");
    }
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (/text\/html|application\/json/.test(ctype)) {
      await res.body?.cancel();
      throw new FetchFail("PDF가 아닌 웹페이지");
    }
    if (!res.body) throw new FetchFail("빈 응답");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new FetchFail("파일이 너무 큼");
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    // 서명 확인: 앞 1KB 안에 %PDF- (앞에 잡음이 조금 붙는 파일이 있다)
    const head = new TextDecoder("latin1").decode(buf.subarray(0, 1024));
    if (!head.includes("%PDF-")) throw new FetchFail("PDF 파일이 아님");
    return buf;
  }
  throw new FetchFail("리디렉션이 너무 많음");
}

/* ───────── 텍스트 추출 ───────── */

type Line = { page: number; text: string };

async function extractLines(data: Uint8Array): Promise<{ lines: Line[]; pages: number }> {
  const { getDocumentProxy } = await import("unpdf");
  // 신뢰할 수 없는 파일: 텍스트만 뽑고 글꼴·외부 자원은 불러오지 않는다 (번들된 pdf.js에는 글꼴 eval 경로가 없다 — CVE-2024-4367 이후)
  const pdf = await getDocumentProxy(data, {
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  try {
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    const lines: Line[] = [];
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      let cur = "";
      for (const it of tc.items) {
        if (!("str" in it)) continue;
        cur += it.str;
        if (it.hasEOL) {
          lines.push({ page: p, text: cur });
          cur = "";
        }
      }
      if (cur) lines.push({ page: p, text: cur });
      page.cleanup();
    }
    return { lines, pages };
  } finally {
    // 문서·작업자 정리 (PDFDocumentProxy에는 destroy가 없고 loadingTask가 갖는다)
    await Promise.resolve(pdf.loadingTask?.destroy?.() ?? pdf.cleanup?.()).catch(() => {});
  }
}

function timeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/* ───────── 절 나누기 ───────── */

export type Section = "front" | "methods" | "results" | "end" | "refs";
export type Block = { page: number; section: Section; text: string };

const NUM = String.raw`^(?:(?:\d{1,2}(?:\.\d{1,2})*|[IVX]{1,4}|[A-H])[.)]?\s+)?`;
const METHODS_HEAD = new RegExp(
  NUM +
    String.raw`(?:materials?\s+and\s+methods?|methods?(?:\s+and\s+materials?)?|methodology|experimental(?:\s+(?:section|setup|set-up|details|procedures?|methods?|apparatus))?|experiments?(?:\s+setup)?|experimental\s+and\s+numerical\s+methods?|numerical\s+(?:methods?|simulations?|model(?:ing|ling)?)|simulation\s+(?:setup|details|methods?)|computational\s+(?:methods?|details)|실험\s*방법|연구\s*방법|실험\s*장치)\s*:?$`,
  "i",
);
const RESULTS_HEAD = new RegExp(NUM + String.raw`(?:results?(?:\s+and\s+discussions?)?|discussions?|결과(?:\s*및\s*고찰)?)\s*$`, "i");
const END_HEAD = new RegExp(
  NUM + String.raw`(?:conclusions?|summary|concluding\s+remarks|data\s+availability(?:\s+statement)?|code\s+availability|author\s+contributions?|acknowledge?ments?|funding|competing\s+interests?|conflicts?\s+of\s+interest|결론)\s*$`,
  "i",
);
const REFS_HEAD = new RegExp(NUM + String.raw`(?:references?(?:\s+and\s+notes)?|bibliography|literature\s+cited|works\s+cited|참고\s*문헌)\s*$`, "i");

/** 줄 단위로 절을 표시하고, 같은 절·같은 쪽 줄을 문단 하나로 잇는다 (줄 끝 하이픈 붙이기) */
export function toBlocks(lines: Line[]): { blocks: Block[]; methodsFound: boolean } {
  let section: Section = "front";
  let methodsFound = false;
  const blocks: Block[] = [];
  let cur: Block | null = null;
  // 여러 쪽에 되풀이되는 줄(쪽 머리말·꼬리말: 저널명, DOI, 쪽 번호)은 본문이 아니다
  const shape = (t: string) => t.replace(/\s+/g, " ").trim().replace(/\d+/g, "#").toLowerCase();
  const pagesOf = new Map<string, Set<number>>();
  for (const l of lines) {
    const k = shape(l.text);
    if (k.length > 0 && k.length <= 120) pagesOf.set(k, (pagesOf.get(k) ?? new Set()).add(l.page));
  }
  const nPages = new Set(lines.map((l) => l.page)).size;
  const repeated = (t: string) => (pagesOf.get(shape(t))?.size ?? 0) >= Math.max(3, Math.ceil(nPages * 0.3));
  for (const raw of lines) {
    if (repeated(raw.text)) continue;
    // 한 줄 안에서 끊긴 낱말 "distri- butions" → "distributions" ("two- and three-"는 그대로)
    const t = raw.text.replace(/\s+/g, " ").trim().replace(/([a-z]{2})- (?!(?:and|or|to|nor)\b)([a-z]{2})/g, "$1$2");
    if (!t) continue;
    if (t.length <= 70) {
      let next: Section | null = null;
      if (METHODS_HEAD.test(t)) next = "methods";
      else if (RESULTS_HEAD.test(t)) next = "results";
      else if (REFS_HEAD.test(t)) next = "refs";
      else if (END_HEAD.test(t)) next = "end";
      if (next) {
        if (next === "methods") methodsFound = true;
        section = next;
        cur = null;
        continue;
      }
    }
    if (!cur || cur.page !== raw.page || cur.section !== section) {
      cur = { page: raw.page, section, text: t };
      blocks.push(cur);
    } else if (/[A-Za-z]-$/.test(cur.text) && /^[a-z]/.test(t)) {
      cur.text = cur.text.slice(0, -1) + t; // "simu-" + "lation"
    } else {
      cur.text += " " + t;
    }
  }
  return { blocks, methodsFound };
}

/* ───────── 문장 고르기 ───────── */

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// pipeline.ts findEvidence와 같은 부정 문맥 규칙
const NEGATION = /\b(no|not|without|never|lack of|lacking|absence of|instead of)\b[^.]*$/i;
const ABBREV = /\b(?:fig|figs|eq|eqs|ref|refs|al|e\.g|i\.e|vs|etc|no|nos|approx|ca|sec|tab|ch|vol|resp|cf)\.$/i;

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?]["')\]]?\s+(?=[A-Z0-9(\[가-힣])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    const piece = text.slice(start, end);
    if (ABBREV.test(piece)) continue; // "Fig. 2" 같은 약어 뒤에서는 자르지 않는다
    out.push(piece.trim());
    start = m.index + m[0].length;
  }
  out.push(text.slice(start).trim());
  // 쪽 아래 머리말·DOI 줄이 문장 끝에 붙어 들어온 경우 떼어낸다 (문장 자체는 그대로)
  return out.map((s) => s.replace(/(?:\s+https?:\/\/\S+)+$/, "")).filter(Boolean);
}

/** 깨진 추출(수식·표 조각)이 아니라 읽을 수 있는 문장인지 */
function readable(s: string): boolean {
  if (s.length < 30 || s.length > 700) return false;
  const letters = (s.match(/[A-Za-z가-힣]/g) ?? []).length;
  if (letters / s.length < 0.6) return false;
  if ((s.match(/\s/g) ?? []).length < 4) return false;
  // 그림 안 글자 조각 ("a Polymer … b Fresnel … c I III IV"): 패널 기호·로마 숫자가 낱말로 여럿 나온다
  return (s.match(/(?<=^|\s)(?:[b-hB-H]|II|III|IV|VI?)(?=\s|$)/g) ?? []).length < 3;
}

const SECTION_SCORE: Record<Section, number> = { methods: 3, results: 1.5, front: 0, end: -1, refs: -100 };
const OWN_WORK = /\b(we|our|was|were|is|are)\b[^.]{0,80}\b(used|employed|performed|carried out|conducted|measured|recorded|captured|built|developed|applied|adopted|installed)\b|\b(we|our)\b/i;

// 인용 표시: [12], [3–5], "Kim et al.", "Ref. 4", 위첨자 번호가 붙은 "panel1,2,11" / "SLM21–23"
const CITES = /\[\d+(?:\s*[,–-]\s*\d+)*\]|\bet al\.|\bRefs?\.\s*\[?\d|[A-Za-z)]\d{1,3}(?:[,–-]\d{1,3})+(?=[\s.,;:)]|$)/i;
const PRIOR = /\b(previous(ly)?|prior (work|research|stud\w*)|earlier stud\w*|in the literature|has been widely|have been widely|conventional(ly)?)\b/i;
// 참고문헌 항목: "[6] MATHAVAN, S., …" / "12. Kim, J. et al." / 따옴표 제목 + 저널 약어
const REFERENCE_LIKE = /^\s*(?:\[\d+\]|\d{1,3}\.\s+[A-Z][A-Za-z'-]+,\s*[A-Z]\.)|^[A-Z][A-Z'-]+,\s+[A-Z]\.|“[^”]{10,}”\s*,?\s*[A-Z][a-z]*\.|\bdoi:\s*10\.|\bvol\.\s*\d+.*\bpp?\.\s*\d+/;

type Scored = { hit: Omit<FullTextHit, "paperTitle" | "url" | "pdfUrl">; score: number };

export function findInBlocks(item: FullTextItemIn, blocks: Block[]): Scored | null {
  const en = item.keywords_en.map((k) => k.trim()).filter(Boolean);
  const ko = item.keywords_ko.map((k) => k.trim()).filter(Boolean);
  if (en.length === 0 && ko.length === 0) return null;
  // 줄 끝 하이픈을 붙이며 "high-speed"가 "highspeed"가 되거나 줄바꿈으로 띄어 쓰인 경우도 같은 말로 본다
  const loose = (k: string) => escapeRe(k).replace(/-/g, "-?").replace(/ +/g, "[\\s-]*");
  // 짧은 약어는 뒤쪽 경계도 본다 ("fps"가 "fpsyg"에 걸리지 않게). 긴 말은 어미 변화 허용 (experiment → experimental)
  const isShort = (k: string) => k.length <= 4;
  // (뒤에 붙은 위첨자 인용 번호 "SLM43"은 허용)
  const enPat = (k: string) => (isShort(k) ? `\\b${loose(k)}s?(?![A-Za-z])` : `\\b${loose(k)}`);
  const re = new RegExp(`(${[...en.map(enPat), ...ko.map(loose)].join("|")})`, "gi");
  const longParts = [...en.filter((k) => !isShort(k)).map(enPat), ...ko.filter((k) => !isShort(k)).map(loose)];
  const longRe = longParts.length ? new RegExp(`(${longParts.join("|")})`, "i") : null;
  const body = blocks.filter((b) => b.section !== "refs"); // 참고문헌 제목은 이 연구실의 일이 아니다
  // 약어("SLM", "fps")만 걸리고 온전한 말("spatial light modulator", "high-speed camera")이 논문 어디에도 없으면
  // 다른 뜻일 가능성이 크다 (예: 레이저 모델명 "Verdi G5 SLM", 휴대폰 "30 fps"). 이때 약어 일치는 버린다
  const allowShort = !!longRe && body.some((b) => longRe.test(b.text));
  let best: Scored | null = null;
  for (const b of body) {
    for (const s of splitSentences(b.text)) {
      if (!readable(s) || REFERENCE_LIKE.test(s)) continue;
      // 남의 연구를 소개하는 문장(인용·"previous studies")은 이 연구실이 했다는 근거가 아니다. 우리(we/our)가 함께 있으면 둔다
      const cites = CITES.test(s) || PRIOR.test(s);
      if (cites && !/\b(we|our)\b/i.test(s)) continue;
      re.lastIndex = 0;
      let first: RegExpExecArray | null = null;
      const distinct = new Set<string>();
      for (let m = re.exec(s); m; m = re.exec(s)) {
        if (NEGATION.test(s.slice(Math.max(0, m.index - 30), m.index))) continue;
        const short = m[0].replace(/s$/i, "").length <= 4;
        if (short && !allowShort) continue;
        // 표시용 키워드는 온전한 말을 우선 (같은 문장에 "SLM"과 "spatial light modulator"가 다 있으면 뒤의 것)
        if (!first || (first[0].length <= 4 && !short)) first = m;
        distinct.add(m[0].toLowerCase());
      }
      if (!first) continue;
      const score =
        SECTION_SCORE[b.section] +
        Math.min(distinct.size, 3) * 0.5 +
        // 여러 낱말 용어 > 한 낱말 > 약어. 약어 문장은 방법 절이어도 온전한 말이 든 문장보다 뒤 (예: 레이저 모델명 "Verdi G5 SLM")
        (/[\s-]/.test(first[0]) ? 1 : first[0].replace(/s$/i, "").length <= 4 ? -2 : 0) +
        (OWN_WORK.test(s) ? 1 : 0) +
        (cites ? -1 : 0);
      if (!best || score > best.score) {
        best = { hit: { sentence: s, matched: first[0], page: b.page, inMethods: b.section === "methods" }, score };
      }
    }
  }
  return best;
}

/* ───────── 논문 하나 읽기 (캐시) ───────── */

type PaperText = {
  status: PaperStatus;
  pdfUrl: string | null;
  pages: number | null;
  methodsFound: boolean;
  detail: string | null;
  blocks: Block[];
};

async function readPaper(work: OAWork): Promise<PaperText> {
  const urls = pdfCandidates(work);
  if (urls.length === 0) return { status: "no_pdf", pdfUrl: null, pages: null, methodsFound: false, detail: "오픈액세스 PDF 없음", blocks: [] };
  let lastFail: PaperText | null = null;
  for (const url of urls) {
    let data: Uint8Array;
    try {
      data = await withSlot(() => download(url));
    } catch (e) {
      const msg = e instanceof FetchFail ? e.message : e instanceof Error && e.name === "TimeoutError" ? "시간 초과" : "내려받기 실패";
      lastFail = { status: "download_failed", pdfUrl: url, pages: null, methodsFound: false, detail: msg, blocks: [] };
      continue;
    }
    try {
      const { lines, pages } = await timeout(extractLines(data), PARSE_TIMEOUT, "읽기 시간 초과");
      const { blocks, methodsFound } = toBlocks(lines);
      const chars = blocks.reduce((n, b) => n + b.text.length, 0);
      if (chars < 500) {
        // 스캔 이미지 PDF 등 글자가 거의 없는 파일
        lastFail = { status: "parse_failed", pdfUrl: url, pages, methodsFound: false, detail: "글자를 뽑을 수 없는 PDF (스캔본일 수 있음)", blocks: [] };
        continue;
      }
      return { status: "checked", pdfUrl: url, pages, methodsFound, detail: null, blocks };
    } catch (e) {
      lastFail = { status: "parse_failed", pdfUrl: url, pages: null, methodsFound: false, detail: e instanceof Error ? e.message.slice(0, 80) : "읽기 실패", blocks: [] };
    }
  }
  return lastFail!;
}

/** 확인된 결과(읽음·공개 PDF 없음)만 저장한다. 내려받기 실패는 다음에 다시 시도 */
function readPaperCached(work: OAWork): Promise<PaperText> {
  return cached("fulltext-v3", { id: work.id, urls: pdfCandidates(work) }, () => readPaper(work), (r) => r.status === "checked" || r.status === "no_pdf");
}

/* ───────── 후보 한 명 ───────── */

export async function checkFullText(
  authorId: string,
  papersIn: FullTextPaperIn[],
  items: FullTextItemIn[],
  onProgress: (e: FullTextProgress) => void = () => {},
): Promise<FullTextResult> {
  const t0 = Date.now();
  const inputs = papersIn
    .map((p) => ({ ...p, wid: workId(p.id) }))
    .filter((p): p is FullTextPaperIn & { wid: string } => !!p.wid)
    .filter((p, i, a) => a.findIndex((q) => q.wid === p.wid) === i)
    .slice(0, MAX_PAPERS);
  onProgress({ stage: "lookup", papers: inputs.length });

  let works = new Map<string, OAWork>();
  let lookupFailed = false;
  if (inputs.length) {
    try {
      works = await fetchWorks(inputs.map((p) => p.wid));
    } catch (e) {
      console.error("[fulltext] openalex", e instanceof Error ? e.message : e);
      lookupFailed = true;
    }
  }

  const withPdf = inputs.filter((p) => {
    const w = works.get(p.wid);
    return w && pdfCandidates(w).length > 0;
  }).length;
  let done = 0;
  onProgress({ stage: "read", pdfs: withPdf, done });

  const texts = await Promise.all(
    inputs.map(async (p): Promise<{ meta: FullTextPaper; blocks: Block[] }> => {
      const w = works.get(p.wid);
      const title = w?.title ?? p.title ?? "";
      const url = w?.doi ?? (p.url && /^https?:\/\//.test(p.url) ? p.url : `https://openalex.org/${p.wid}`);
      if (!w) {
        const detail = lookupFailed ? "OpenAlex 조회 실패" : "OpenAlex에 없는 논문";
        return { meta: { id: p.wid, title, url, status: lookupFailed ? "download_failed" : "no_pdf", pdfUrl: null, pages: null, methodsFound: false, detail }, blocks: [] };
      }
      const hasPdf = pdfCandidates(w).length > 0;
      let r: PaperText;
      try {
        r = await readPaperCached(w);
      } catch (e) {
        r = { status: "download_failed", pdfUrl: null, pages: null, methodsFound: false, detail: e instanceof Error ? e.message.slice(0, 80) : "실패", blocks: [] };
      }
      if (hasPdf) onProgress({ stage: "read", pdfs: withPdf, done: ++done });
      const { blocks, ...rest } = r;
      return { meta: { id: p.wid, title, url, ...rest }, blocks };
    }),
  );

  const resultItems: FullTextItem[] = items.map((it) => {
    let best: (Scored & { paper: FullTextPaper }) | null = null;
    for (const t of texts) {
      if (t.meta.status !== "checked") continue;
      const s = findInBlocks(it, t.blocks);
      if (s && (!best || s.score > best.score)) best = { ...s, paper: t.meta };
    }
    return {
      label: it.label,
      hit: best ? { ...best.hit, paperTitle: best.paper.title, url: best.paper.url, pdfUrl: best.paper.pdfUrl! } : null,
    };
  });

  return { authorId, papers: texts.map((t) => t.meta), items: resultItems, ms: Date.now() - t0 };
}
