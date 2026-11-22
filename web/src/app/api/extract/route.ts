import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const maxDuration = 60;

const client = new Anthropic();
const MAX_BYTES = 4 * 1024 * 1024; // Vercel 함수 요청 한도(4.5MB) 안쪽

const Schema = z.object({
  title: z.string(),
  methods: z.array(z.enum(["시뮬레이션", "실험", "이론", "데이터 분석"])),
  equipment: z.array(z.string()),
  data: z.array(z.string()),
  planned_advisor: z.object({ name: z.string(), name_en: z.string(), affiliation: z.string() }).nullable(),
});

// question은 Claude가 만들지 않는다: 제안서의 연구 주제(국문) 원문을 그대로 쓴다
export type Extracted = z.infer<typeof Schema> & { question: string };

const SYSTEM = `You read a Korean high-school R&E research proposal (PDF) and COPY fields out of it. You are a transcriber, not an editor.

Absolute rule: every string you return must be copied character-for-character from the document. Do not paraphrase, summarize, translate, shorten, reorder words, or fix spacing/typos. If a field is not written in the document, return an empty value instead of inventing one.

Return:
- title: the Korean research title (연구 주제 – 국문) exactly as written.
- methods: which of 시뮬레이션 / 실험 / 이론 / 데이터 분석 the plan explicitly says it uses (this is a selection, not text).
- equipment: 0-6 physical instruments or measurement/fabrication techniques the plan needs, each copied exactly as the document writes it (e.g. if the document says "공간 광변조기(SLM)" return exactly "공간 광변조기(SLM)"). Prefer the 연구키워드 section and the methods section. One item per string; do not merge items. Skip plain generic items every lab has ("레이저", "카메라", "렌즈") unless the document names a special type. Datasets and software do NOT go here.
- data: 0-4 datasets, databases, or data sources the plan needs (e.g. "교통카드 승하차 데이터", "기상청 ASOS 관측자료", "PDB 단백질 구조"), copied exactly as written. Software tools (e.g. COMSOL, Python) are not data; skip them.
- planned_advisor: the external professor the team plans to contact, if written. name and affiliation copied exactly as written (affiliation = university + department as written); name_en = the usual English romanization used on papers (e.g. "YongKeun Park") — the only field you may produce yourself. null if none.

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
    const extracted: Extracted = { ...out, title: out.title.trim(), question: out.title.trim() };
    return Response.json(extracted);
  } catch (e) {
    console.error("[extract]", e instanceof Error ? e.message : e);
    return Response.json({ error: "제안서 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
