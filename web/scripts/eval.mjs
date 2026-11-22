#!/usr/bin/env node
/**
 * 정확도 평가: "실제로 연락한(또는 지도받은) 교수가 결과 몇 위에 나오는가"
 *
 * 실행 (dev 서버가 떠 있어야 함):
 *   cd web && node --experimental-strip-types --no-warnings scripts/eval.mjs [cases.json] [--base http://localhost:3000]
 *
 * cases.json (기본: eval/cases.json) 형식 — 둘 중 하나:
 *   { "id": "선배A", "question": "...", "methods": ["실험"], "equipment": "고속카메라",
 *     "advisor": { "name": "김경천", "name_en": "Kyung Chun Kim", "affiliation": "부산대학교" } }
 *   { "id": "선배B", "pdf": "eval/pdfs/선배B.pdf", "advisor": { ... } }   ← 제안서 PDF로 입력을 뽑는다
 *   pdf 케이스에서 advisor를 비우면 제안서에 적힌 연락 예정 교수(planned_advisor)를 정답으로 쓴다.
 *
 * 결과: 표 출력 + eval/results-<시각>.json 저장. 제안서 PDF는 커밋하지 않는다(.gitignore).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { koreanNameMatches } from "../src/lib/kornames.ts";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : "http://localhost:3000";
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base") ?? "eval/cases.json";
const cases = JSON.parse(readFileSync(file, "utf8"));

const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z가-힣]/g, "");

/** 영문 이름 두 표기가 같은가 (성·이름 순서 무시) */
function sameEnglish(a, b) {
  const ta = (a ?? "").toLowerCase().split(/[\s,.\-‐]+/).filter(Boolean).sort().join("");
  const tb = (b ?? "").toLowerCase().split(/[\s,.\-‐]+/).filter(Boolean).sort().join("");
  return !!ta && ta === tb;
}

function isAdvisor(advisor, name) {
  if (!name) return false;
  if (advisor.name && norm(advisor.name) === norm(name)) return true;
  if (advisor.name_en && sameEnglish(advisor.name_en, name)) return true;
  if (advisor.name && /[a-z]/i.test(name) && koreanNameMatches(advisor.name, name)) return true;
  return false;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, body instanceof FormData ? { method: "POST", body } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${data.error ?? ""}`);
  return data;
}

const rows = [];
for (const c of cases) {
  const t0 = Date.now();
  try {
    let input = { question: c.question, methods: c.methods ?? [], equipment: c.equipment ?? "" };
    let advisor = c.advisor;
    if (c.pdf) {
      const fd = new FormData();
      fd.append("file", new Blob([readFileSync(c.pdf)], { type: "application/pdf" }), basename(c.pdf));
      const ex = await post("/api/extract", fd);
      input = { question: ex.question, methods: ex.methods, equipment: (ex.equipment ?? []).join(", ") };
      advisor = advisor?.name ? advisor : ex.planned_advisor;
    }
    if (!advisor?.name && !advisor?.name_en) throw new Error("정답 교수(advisor)가 없습니다");

    const r = await post("/api/search", input);
    const mainRank = r.candidates.findIndex((x) => isAdvisor(advisor, x.name)) + 1;
    const domRank =
      r.domestic.candidates.findIndex((x) => isAdvisor(advisor, x.name) || isAdvisor(advisor, x.nameEn)) + 1;
    rows.push({
      id: c.id ?? c.pdf ?? input.question.slice(0, 20),
      advisor: advisor.name ?? advisor.name_en,
      mainRank: mainRank || null,
      domesticRank: domRank || null,
      top5: r.candidates.slice(0, 5).map((x) => `${x.name}(${x.institution})`),
      papers: r.stats.papers,
      exaPapers: r.stats.exaPapers ?? 0,
      sec: Math.round((Date.now() - t0) / 100) / 10,
    });
  } catch (e) {
    rows.push({ id: c.id ?? c.pdf, error: e instanceof Error ? e.message : String(e) });
  }
  const last = rows[rows.length - 1];
  console.log(
    last.error
      ? `✗ ${last.id}: ${last.error}`
      : `${last.mainRank && last.mainRank <= 5 ? "✓" : last.mainRank || last.domesticRank ? "△" : "✗"} ${last.id} — 정답 ${last.advisor}: 전체 ${last.mainRank ?? "없음"}위 · 국내 ${last.domesticRank ?? "없음"}위 (${last.sec}s)`,
  );
}

const ok = rows.filter((r) => !r.error);
const pct = (n) => (ok.length ? `${Math.round((100 * n) / ok.length)}%` : "-");
const mrr = ok.length ? ok.reduce((s, r) => s + (r.mainRank ? 1 / r.mainRank : 0), 0) / ok.length : 0;
const summary = {
  cases: ok.length,
  errors: rows.length - ok.length,
  hitAt5: pct(ok.filter((r) => r.mainRank && r.mainRank <= 5).length),
  hitAt15: pct(ok.filter((r) => r.mainRank).length),
  anySection: pct(ok.filter((r) => r.mainRank || r.domesticRank).length),
  mrr: Math.round(mrr * 1000) / 1000,
};
console.log("\n요약:", summary);

mkdirSync("eval", { recursive: true });
const out = `eval/results-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(out, JSON.stringify({ base: BASE, file, summary, rows }, null, 2));
console.log(`저장: ${out}`);
