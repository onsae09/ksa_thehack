#!/usr/bin/env node
/**
 * 데모 캐시 고정: 예시 주제를 한 번씩 검색해 서버 파일 캐시(.cache/search-v1)에 저장한다.
 * 이후 같은 입력은 저장된 결과가 그대로 나온다 (검색어가 실행마다 달라 순위가 흔들리는 문제 대비).
 *
 *   node scripts/warm.mjs [--base https://labfit.onsae.org] [--fresh]
 *   --fresh: 저장본을 버리고 새로 검색해 덮어쓴다
 *
 * 예시 목록은 화면의 예시 주제(EXAMPLES)와 같아야 캐시가 맞는다. 바꾸면 여기도 같이 바꾼다.
 */
const EXAMPLES = [
  { question: "탁구공의 회전이 반발 궤적에 주는 영향을 모델링할 수 있는가", methods: ["시뮬레이션", "실험"], equipment: "고속카메라" },
  { question: "미세플라스틱 농도가 담수 동물플랑크톤의 성장과 생존에 미치는 영향", methods: ["실험", "데이터 분석"], equipment: "" },
  { question: "그래프 신경망으로 지하철 역별 혼잡도를 예측할 수 있는가", methods: ["데이터 분석", "시뮬레이션"], equipment: "", data: "교통카드 승하차 데이터" },
];

const args = process.argv.slice(2);
const bi = args.indexOf("--base");
const BASE = bi >= 0 ? args[bi + 1] : "https://labfit.onsae.org";
const fresh = args.includes("--fresh");

for (const ex of EXAMPLES) {
  const t = Date.now();
  const res = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...ex, fresh }),
    signal: AbortSignal.timeout(120_000),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`실패 ${res.status}  ${ex.question.slice(0, 24)}  ${r.error ?? ""}`);
    continue;
  }
  const top = r.candidates.slice(0, 3).map((c) => c.name).join(", ");
  console.log(`${r.cachedAt ? "저장본" : "새 검색"} ${((Date.now() - t) / 1000).toFixed(1)}s  ${ex.question.slice(0, 24)}…  상위: ${top}`);
}
