import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const maxDuration = 60;

const client = new Anthropic();
const MAX_BYTES = 4 * 1024 * 1024; // Vercel 함수 요청 한도(4.5MB) 안쪽

const Schema = z.object({
  title: z.string(),
  aim: z.string(),
  methods: z.array(z.enum(["시뮬레이션", "실험", "이론", "데이터 분석"])),
  equipment: z.array(z.string()),
  data: z.array(z.string()),
  planned_advisor: z.object({ name: z.string(), name_en: z.string(), affiliation: z.string() }).nullable(),
});

// question은 Claude가 만들지 않는다: 제안서의 연구 주제(국문) 원문, 제목이 없는 자유 양식이면
// 연구 목표를 밝힌 문장 원문을 그대로 쓴다
export type Extracted = z.infer<typeof Schema> & { question: string; source: "title" | "aim" };

const SYSTEM = `You read a Korean high-school R&E research proposal (PDF) and COPY fields out of it. You are a transcriber, not an editor.

The layout varies. Some proposals use the school's official form (a cover table with 연구 주제 국문/영문, 책임 지도자, 학생 정보); many do not: they may start straight at 연구 키워드 or 요약, use their own headings (연구 배경, 연구 목표, 연구 내용 및 방법, 연구 계획, 참고 문헌…), mix English and Korean, or have no headings at all. Read the WHOLE document, every page, and find each field wherever it appears. Never assume a field is missing just because the official table is missing.

Absolute rule: every string you return must be copied character-for-character from the document. Do not paraphrase, summarize, translate, shorten, reorder words, or fix spacing/typos. If a field is not written in the document, return an empty value instead of inventing one.

Return:
- title: the research title exactly as written — the 연구 주제 (국문) cell on the official form, otherwise a line clearly presented as the title (cover page, top heading, "제목:", "연구 주제:", "연구명:"). Prefer the Korean title when both exist. Section headings ("연구 계획서", "연구 배경 및 목표") and program names ("2027학년도 R&E 프로그램") are NOT titles. "" if no title is written.
- aim: ONE sentence copied exactly that states what this study itself will investigate, usually "본 연구에서는 … 하고자 한다." / "본 연구의 목표는 …" in the abstract, 연구 목표 or 연구 내용 section. Pick the sentence that names the concrete object and question of study, not background about prior work. Copy the full sentence, nothing outside it. Always fill this, even when a title exists.
- methods: which of 시뮬레이션 / 실험 / 이론 / 데이터 분석 the plan explicitly says it uses (this is a selection, not text). Proofs/derivations = 이론; numerical computation or code-based modelling (e.g. Python, MATLAB, COMSOL) = 시뮬레이션.
- equipment: 0-6 physical instruments or measurement/fabrication techniques the plan needs, each copied exactly as the document writes it (e.g. if the document says "공간 광변조기(SLM)" return exactly "공간 광변조기(SLM)"). Look in the keyword list, methods and plan sections wherever they are. One item per string; do not merge items. Skip plain generic items every lab has ("레이저", "카메라", "렌즈") unless the document names a special type. Datasets, software and purely mathematical/theoretical work have no equipment: return [].
- data: 0-4 datasets, databases, or data sources the plan needs (e.g. "교통카드 승하차 데이터", "기상청 ASOS 관측자료", "PDB 단백질 구조"), copied exactly as written. Software tools (e.g. COMSOL, Python) and cited papers are not data; skip them.
- planned_advisor: the external professor the team plans to contact, if written anywhere (official table, or a sentence such as "○○대 ○○학과 ○○○ 교수님께 지도를 요청할 계획"). name and affiliation copied exactly as written (affiliation = university + department as written); name_en = the usual English romanization used on papers (e.g. "YongKeun Park") — the only field you may produce yourself. Authors of cited references are NOT planned advisors. null if none.

Do NOT include any student names, IDs, phone numbers or emails.`;

export async function POST(req: Request) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return Response.json({ error: "파일을 읽지 못했습니다." }, { status: 400 });
  }
  if (!file) return Response.json({ error: "PDF 파일을 올려 주세요." }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "PDF 파일만 올릴 수 있습니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "4MB 이하의 PDF만 올릴 수 있습니다." }, { status: 400 });
  }

  // PDF는 추출에만 쓰고 저장하거나 로그에 남기지 않는다 (연락처 등 개인정보 포함)
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const res = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
            { type: "text", text: "이 연구제안서에서 항목을 추출해 주세요." },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return Response.json({ error: "제안서에서 내용을 추출하지 못했습니다." }, { status: 422 });
    }
    const out = res.parsed_output;
    const title = out.title.trim();
    // 수식용 유니코드(𝑛, 𝐺𝑛 등)는 검색어에서 깨지므로 NFKC로 보통 글자로 바꾼다 (표시는 원문 그대로)
    const aim = out.aim.normalize("NFKC").replace(/\s+/g, " ").trim();
    const question = title || aim;
    if (!question) {
      return Response.json({ error: "제안서에서 연구 주제나 목표 문장을 찾지 못했습니다. 질문을 직접 적어 주세요." }, { status: 422 });
    }
    const extracted: Extracted = { ...out, title, aim, question, source: title ? "title" : "aim" };
    return Response.json(extracted);
  } catch (e) {
    console.error("[extract]", e instanceof Error ? e.message : e);
    return Response.json({ error: "제안서 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
