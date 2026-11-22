import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { CheckItem, Normalized, SearchInput } from "./types";

const client = new Anthropic();

const Schema = z.object({
  query_en: z.string(),
  search_queries: z.array(z.string()),
  search_queries_ko: z.array(z.string()),
  method_query_en: z.string(),
  method_search_queries: z.array(z.string()),
  method_search_queries_ko: z.array(z.string()),
  // 학생이 적은 항목(방법·장비) 각각의 키워드. label은 입력 그대로.
  given: z.array(z.object({ label: z.string(), keywords_en: z.array(z.string()), keywords_ko: z.array(z.string()) })),
  // 장비 칸이 비었을 때만 채운다
  inferred_equipment: z.array(z.object({ label: z.string(), keywords_en: z.array(z.string()), keywords_ko: z.array(z.string()) })),
});

const SYSTEM = `You prepare a Korean high-school research plan for searching academic papers in OpenAlex.

Return:
- query_en: the research question as one clear English sentence, phrased like a paper abstract would describe the topic.
- search_queries: exactly 3 short English keyword queries (2-5 words each) that would find papers on this topic. Vary them: core phenomenon, method-specific, application angle.
- search_queries_ko: exactly 2 short Korean keyword queries (2-4 words) for searching Korean domestic journals (DBpia), using terms Korean researchers would put in titles.
- method_query_en: ONE English sentence describing HOW the research is done, phrased like a methods-focused abstract sentence, independent of the topic (e.g. "Experiments using a spatial light modulator to shape laser beams and off-axis digital holography to measure complex optical fields, combined with numerical wave propagation simulation."). Name the key instruments/techniques.
- method_search_queries: exactly 2 short English queries (2-5 words) that find papers USING the key equipment/technique, regardless of topic (e.g. "off-axis digital holography", "spatial light modulator beam shaping").
- method_search_queries_ko: exactly 1 short Korean query for the key equipment/technique (e.g. "디지털 홀로그래피").
- given: one entry for EVERY label listed under "ITEMS", in the same order, label copied exactly.
- inferred_equipment: only if the student left equipment empty, 1-3 equipment/tools/data the research most likely needs, with a short Korean label. Otherwise an empty array.

keywords_en rules (used to find evidence sentences in abstracts with a case-insensitive word match):
- 3-6 lowercase English terms that name the METHOD or EQUIPMENT ITSELF, e.g. for high-speed camera: "high-speed camera", "high-speed video", "high speed imaging", "fps"; for simulation: "simulation", "simulated", "numerical model", "finite element", "cfd".
- NEVER include topic words, phenomena, measured quantities or outcomes (bad: "trajectory prediction", "ridership", "spin rate", "survival", "crowding").
- NEVER include words that appear in almost every abstract ("study", "analysis", "data", "model", "results", "method").
- For a dataset, name the data source itself (e.g. "smart card", "afc data", "transit card").

keywords_ko: the same idea in Korean, 3-6 terms as they would literally appear in a Korean abstract (e.g. "시뮬레이션", "수치해석", "유한요소", "고속 카메라", "고속카메라", "교통카드"). Same rules: method/equipment itself only, no topic words.`;

function splitEquipment(s: string): string[] {
  return s.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
}

const STOP = new Set(["study", "analysis", "data", "model", "models", "results", "method", "methods", "experiment"]);

function cleanKeywords(ks: string[]): string[] {
  // "experiment" 한 단어는 거의 모든 초록에 나와서 제외하고 "experimental", "experiments were" 같은 구체형을 쓴다
  return [...new Set(ks.map((k) => k.toLowerCase().trim()).filter((k) => k.length > 1 && !STOP.has(k)))];
}

// Claude가 키워드를 못 준 경우의 기본값
const DEFAULT_METHOD_KEYWORDS: Record<string, string[]> = {
  시뮬레이션: ["simulation", "simulated", "numerical", "finite element", "computational"],
  실험: ["experimental", "experiments were", "we measured", "measured using", "apparatus", "test rig"],
  이론: ["theoretical", "analytical model", "analytical solution", "derive", "theory"],
  "데이터 분석": ["dataset", "statistical analysis", "regression", "machine learning", "data-driven"],
};

export async function normalize(input: SearchInput): Promise<Normalized> {
  const equipment = splitEquipment(input.equipment);
  const givenLabels = [...input.methods, ...equipment];
  const user = [
    `연구 질문: ${input.question}`,
    `ITEMS (methods then equipment): ${givenLabels.map((l) => `"${l}"`).join(", ")}`,
    `Equipment field: ${equipment.length ? "filled" : "EMPTY — infer equipment"}`,
  ].join("\n");

  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(Schema) },
    messages: [{ role: "user", content: user }],
  });

  if (res.stop_reason === "refusal" || !res.parsed_output) {
    throw new Error("입력 정리에 실패했습니다. 질문을 조금 바꿔서 다시 시도해 주세요.");
  }
  const out = res.parsed_output;
  const kwByLabel = new Map(out.given.map((g) => [g.label.trim(), g.keywords_en]));
  const koByLabel = new Map(out.given.map((g) => [g.label.trim(), g.keywords_ko]));

  // 항목 목록은 코드가 입력에서 만든다. Claude는 키워드만 채운다.
  const items: CheckItem[] = [
    ...input.methods.map((m) => ({
      label: m,
      kind: "method" as const,
      inferred: false,
      keywords_en: cleanKeywords([...(kwByLabel.get(m) ?? []), ...(DEFAULT_METHOD_KEYWORDS[m] ?? [])]),
      keywords_ko: cleanKeywords([...(koByLabel.get(m) ?? []), m]),
    })),
    ...equipment.map((e) => ({
      label: e,
      kind: "equipment" as const,
      inferred: false,
      keywords_en: cleanKeywords(kwByLabel.get(e) ?? []),
      keywords_ko: cleanKeywords([...(koByLabel.get(e) ?? []), e]),
    })),
    ...(equipment.length === 0 ? out.inferred_equipment.slice(0, 3) : []).map((e) => ({
      label: e.label,
      kind: "equipment" as const,
      inferred: true,
      keywords_en: cleanKeywords(e.keywords_en),
      keywords_ko: cleanKeywords(e.keywords_ko),
    })),
  ];

  return {
    query_en: out.query_en,
    search_queries: out.search_queries.slice(0, 3),
    search_queries_ko: out.search_queries_ko.slice(0, 2),
    method_query_en: out.method_query_en,
    method_search_queries: out.method_search_queries.slice(0, 2),
    method_search_queries_ko: out.method_search_queries_ko.slice(0, 1),
    items,
  };
}
