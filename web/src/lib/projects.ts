/**
 * NTIS 국가과제로 후보 보강. 검색 결과가 나온 뒤 화면이 따로 부른다.
 *
 * 1) 한국어 검색어로 최근 6년 과제를 모으고(대학·연구기관만), 연구 질문과 과제명의 유사도로 정렬
 * 2) OpenAlex 후보: 같은 기관(한국어 기관명) + 영문 이름과 한글 연구책임자 이름 표기가 맞을 때만 연결
 * 3) 국내(DBpia) 후보: 한글 이름이 같을 때 연결 (기관 미확인 → 화면에서 "동명이인 가능")
 * 4) 후보 목록에 없는 과제 책임자 → "놓친 후보일 수 있음"
 */
import { similarities } from "./embed";
import { koreanInstitutionNames, koreanNameMatches, sameOrgan } from "./kornames";
import { isResearchOrgan, searchProjects } from "./ntis";
import type { NtisProject, ProjectsResult } from "./types";

export type ProjectsRequest = {
  question: string;
  queries: string[];
  candidates: { authorId: string; name: string; institutionId: string }[];
  names: string[];
};

const MIN_SIMILARITY = 0.33;

const FAILED: ProjectsResult = { status: "failed", projects: [], byCandidate: {}, byDomestic: {}, others: [] };

export async function lookupProjects(req: ProjectsRequest): Promise<ProjectsResult> {
  const queries = [...new Set(req.queries.map((q) => q.trim()).filter(Boolean))].slice(0, 4);
  if (queries.length === 0) return { ...FAILED, status: "ok" };

  const settled = await Promise.allSettled(queries.map((q) => searchProjects(q)));
  if (settled.every((s) => s.status === "rejected")) return FAILED;

  const fromYear = new Date().getFullYear() - 6;
  // 같은 과제의 여러 연차·같은 과제번호 중복 제거 (가장 최근 연도만)
  const byKey = new Map<string, Omit<NtisProject, "similarity">>();
  for (const p of settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))) {
    if (p.year < fromYear || !p.pi || !isResearchOrgan(p.organ)) continue;
    const key = `${p.title.replace(/^\([^)]*\)\s*/, "").replace(/\s/g, "")}|${p.pi}`;
    const prev = byKey.get(key);
    if (!prev || p.year > prev.year) byKey.set(key, p);
  }
  const pool = [...byKey.values()];
  if (pool.length === 0) return { ...FAILED, status: "ok" };

  let sims: number[];
  try {
    [sims] = await similarities([req.question], pool.map((p) => p.title));
  } catch {
    sims = pool.map(() => 0); // 정렬만 못 할 뿐 결과는 보여준다
  }
  const scored: NtisProject[] = pool
    .map((p, i) => ({ ...p, similarity: Math.round(sims[i] * 1000) / 1000 }))
    .sort((a, b) => b.similarity - a.similarity)
    // NTIS 검색은 단어 하나만 맞아도 걸려서 엉뚱한 과제가 많다. 질문과 과제명 유사도로 거른다
    // (홀로그래피 예시: 관련 과제 0.42~0.49 / 탁구공 예시의 무관한 과제 ≤0.21)
    .filter((p) => p.similarity >= MIN_SIMILARITY);

  // OpenAlex 후보 ↔ 과제 책임자 (같은 기관 + 이름 표기)
  const koInst = await koreanInstitutionNames(req.candidates.map((c) => c.institutionId));
  const byCandidate: Record<string, NtisProject[]> = {};
  const matchedPI = new Set<string>();
  for (const c of req.candidates) {
    const ko = koInst.get(c.institutionId);
    if (!ko) continue;
    const mine = scored.filter((p) => sameOrgan(p.organ, ko) && koreanNameMatches(p.pi, c.name));
    if (mine.length) {
      byCandidate[c.authorId] = mine.slice(0, 3);
      mine.forEach((p) => matchedPI.add(`${p.pi}|${p.organ}`));
    }
  }

  // 국내 후보 ↔ 과제 책임자 (이름만)
  const byDomestic: Record<string, NtisProject[]> = {};
  for (const name of new Set(req.names.map((n) => n.trim()).filter((n) => /^[가-힣]{2,4}$/.test(n)))) {
    const mine = scored.filter((p) => p.pi === name);
    if (mine.length) {
      byDomestic[name] = mine.slice(0, 3);
      mine.forEach((p) => matchedPI.add(`${p.pi}|${p.organ}`));
    }
  }

  // 후보 목록에 없는 과제 책임자: 질문과 가까운 과제 순으로 사람 단위로 묶는다
  const groups = new Map<string, { pi: string; organ: string; projects: NtisProject[] }>();
  for (const p of scored.slice(0, 30)) {
    const key = `${p.pi}|${p.organ}`;
    if (matchedPI.has(key)) continue;
    const g = groups.get(key) ?? { pi: p.pi, organ: p.organ, projects: [] };
    g.projects.push(p);
    groups.set(key, g);
  }

  return {
    status: "ok",
    projects: scored.slice(0, 8),
    byCandidate,
    byDomestic,
    others: [...groups.values()].slice(0, 6).map((g) => ({ ...g, projects: g.projects.slice(0, 2) })),
  };
}
