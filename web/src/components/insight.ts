/**
 * 검색 결과가 나온 뒤 따로 불러오는 두 가지:
 * - 제안서의 연락 예정 교수 (상위 15명에 없을 때 /api/advisor → 연구실 페이지·국가과제도 그 사람만 따로)
 * - "맞는 점 / 빈틈" 분석 (/api/fit). 다른 출처(연구실·ZEUS·NTIS)와 연락 예정 교수 조회가 끝난 뒤 그 근거로 만든다
 */
import { useEffect, useState } from "react";
import type { AdvisorResult } from "@/lib/advisor";
import type { FitResult, FitSource } from "@/lib/fit";
import type { Candidate, LabPagesResult, NtisProject, ProjectsResult, SearchResult } from "@/lib/types";
import { normName, postJSON, type Async, type SideData } from "./data";
import { candidateView, itemCell } from "./model";

export type PlannedAdvisor = { name: string; name_en: string; affiliation: string };

/** 결과 안에서 연락 예정 교수 찾기 (이름 표기 차이를 고려해 성·이름 순서 둘 다 비교) */
export function advisorIndex(advisor: PlannedAdvisor, result: SearchResult) {
  const en = advisor.name_en.trim().split(/\s+/);
  const variants = new Set([normName(advisor.name), normName(en.join("")), normName([...en.slice(-1), ...en.slice(0, -1)].join(""))]);
  const main = result.candidates.findIndex((c) => variants.has(normName(c.name)));
  const dom = result.domestic.candidates.findIndex((c) => variants.has(normName(c.name)) || (c.nameEn && variants.has(normName(c.nameEn))));
  return { main, dom };
}

export type AdvisorData = AdvisorResult & { lab: LabPage | null; labState: "ok" | "failed" | "none"; projects: NtisProject[] | null };
type LabPage = LabPagesResult["byCandidate"][string];

/** 상위 15명 밖일 때만 조회. 키가 바뀌면(새 검색) 다시 조회한다 */
export function useAdvisorLookup(advisor: PlannedAdvisor | null | undefined, result: SearchResult | null, question: string): Async<AdvisorData> {
  const need = !!advisor && !!result && advisorIndex(advisor, result).main < 0;
  const key = need ? `${advisor!.name}|${advisor!.name_en}|${result!.normalized.query_en}|${result!.stats.ms}` : "";
  const [state, setState] = useState<{ key: string; value: Async<AdvisorData> }>({ key: "", value: { state: "idle" } });

  useEffect(() => {
    if (!key || !advisor || !result) return;
    let alive = true;
    (async () => {
      try {
        const r = await postJSON<AdvisorResult>("/api/advisor", {
          ...advisor,
          query_en: result.normalized.query_en,
          method_query_en: result.normalized.method_query_en,
          items: result.normalized.items,
          scores: result.stats.scores,
        });
        let data: AdvisorData = { ...r, lab: null, labState: "none", projects: null };
        if (r.candidate) {
          const c = r.candidate;
          const one = { authorId: c.authorId, name: c.name, institution: c.institution, institutionId: c.institutionId };
          const ntis = result.normalized.ntis_queries_ko?.length
            ? result.normalized.ntis_queries_ko
            : [...result.normalized.search_queries_ko, ...result.normalized.method_search_queries_ko];
          // 연구실 페이지·국가과제를 이 사람만 따로 (상위 후보용 요청과 같은 API)
          const [labs, projects] = await Promise.all([
            postJSON<LabPagesResult>("/api/labpages", {
              candidates: [one],
              items: result.normalized.items.map((i) => ({ label: i.label, keywords_ko: i.keywords_ko, keywords_en: i.keywords_en })),
            }).catch(() => null),
            postJSON<ProjectsResult>("/api/projects", { question, queries: ntis, candidates: [one], names: [] }).catch(() => null),
          ]);
          data = {
            ...data,
            lab: labs?.status === "ok" ? (labs.byCandidate[c.authorId] ?? null) : null,
            labState: labs?.status === "ok" ? "ok" : labs ? "none" : "failed",
            projects: projects?.status === "ok" ? (projects.byCandidate[c.authorId] ?? []) : null,
          };
        }
        if (alive) setState({ key, value: { state: "ok", data } });
      } catch {
        if (alive) setState({ key, value: { state: "failed" } });
      }
    })();
    return () => {
      alive = false;
    };
    // key가 advisor·result를 대표한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { state: "idle" };
  return state.key === key ? state.value : { state: "loading" };
}

/** 연락 예정 교수의 연구실 페이지·국가과제를 상위 후보 데이터에 합쳐, 같은 상세 화면(Sheet)이 그대로 보여줄 수 있게 한다 */
export function withAdvisorSide(side: SideData, adv: Async<AdvisorData>): SideData {
  if (adv.state !== "ok" || !adv.data.candidate) return side;
  const id = adv.data.candidate.authorId;
  const { lab, projects } = adv.data;
  let labs = side.labs;
  if (lab && labs.state === "ok" && labs.data.status === "ok") labs = { state: "ok", data: { ...labs.data, byCandidate: { ...labs.data.byCandidate, [id]: lab } } };
  else if (lab && labs.state !== "loading") labs = { state: "ok", data: { status: "ok", byCandidate: { [id]: lab } } };
  let proj = side.projects;
  if (projects && proj.state === "ok") proj = { state: "ok", data: { ...proj.data, byCandidate: { ...proj.data.byCandidate, [id]: projects } } };
  return { ...side, labs, projects: proj };
}

/* ───────── 맞는 점 / 빈틈 ───────── */

export const FIT_TOP = 5;

/** 후보 한 명의 근거 원문 목록 (이미 화면에 있는 것만) */
export function fitSources(c: Candidate, side: SideData): { sources: FitSource[]; covered: string[] } {
  const v = candidateView(c, side);
  const sources: FitSource[] = [];
  const texts = new Set<string>();
  const add = (s: FitSource) => {
    if (!s.text || texts.has(s.text)) return;
    texts.add(s.text);
    sources.push(s);
  };
  for (const p of c.topPapers) add({ kind: "abstract", title: `${p.title} (${p.year}, 초록)`, url: p.url, text: p.abstract });
  for (const it of c.items) {
    const e = it.evidence;
    if (e && !sources.some((s) => s.text.includes(e.sentence))) add({ kind: "abstract", title: `${e.paperTitle} (초록 문장)`, url: e.url, text: e.sentence });
  }
  if (v.lab) for (const e of v.lab.equipment) add({ kind: "lab", title: `연구실 페이지 ${v.lab.title} — ${e.label}`, url: v.lab.url, text: e.snippet });
  for (const p of v.projects ?? []) add({ kind: "ntis", title: `NTIS 국가과제 ${p.year} · 책임자 ${p.pi} · ${p.organ}`, url: p.url, text: p.title });
  for (const e of v.piEquip ?? []) add({ kind: "zeus", title: `ZEUS 장비 (구축 과제 책임자 ${e.equip.pi}, ${e.equip.organ}) — ${e.label}`, url: e.equip.url, text: e.equip.name });
  for (const pi of v.inst?.perItem ?? []) {
    const first = pi.items[0];
    if (first) add({ kind: "zeus", title: `ZEUS 기관 보유 장비 (${v.inst!.koName}, 이 연구실 소유인지는 미확인) — ${pi.label}`, url: first.url, text: first.name });
  }
  // 사람 단위 근거(논문·연구실·과제 장비)가 있는 항목만 "확인됨"으로 본다. 기관 보유 장비는 연구실 것인지 모른다
  const covered = c.items.map((i) => i.label).filter((l) => itemCell(v.table, l).hits.some((h) => h === "paper" || h === "lab" || h === "zeusPi"));
  return { sources: sources.slice(0, 18), covered };
}

const settled = (a: Async<unknown>) => a.state !== "loading";

/** 상위 5명(+ 연락 예정 교수)의 분석. 다른 출처가 다 들어온 뒤 한 번 부른다 */
export function useFitAnalysis(result: SearchResult | null, side: SideData, adv: Async<AdvisorData>, question: string, displayName: (c: Candidate) => string) {
  const ready = !!result && settled(side.labs) && settled(side.projects) && settled(side.equip) && settled(adv);
  const ranked = result?.candidates.filter((c) => (c.group ?? "main") !== "affiliation") ?? [];
  const targets: { c: Candidate; role: string }[] = ranked.slice(0, FIT_TOP).map((c, i) => ({ c, role: `${i + 1}위` }));
  if (adv.state === "ok" && adv.data.candidate && !targets.some((t) => t.c.authorId === adv.data.candidate!.authorId)) {
    targets.push({ c: adv.data.candidate, role: "제안서의 연락 예정 교수" });
  }
  const key = ready && targets.length ? `${result!.normalized.query_en}|${result!.stats.ms}|${targets.map((t) => t.c.authorId).join(",")}` : "";
  const [state, setState] = useState<{ key: string; value: Async<FitResult> }>({ key: "", value: { state: "idle" } });

  useEffect(() => {
    if (!key || !result) return;
    let alive = true;
    const merged = withAdvisorSide(side, adv);
    const body = {
      question,
      items: result.normalized.items.map((i) => ({ label: i.label, keywords_en: i.keywords_en, keywords_ko: i.keywords_ko })),
      candidates: targets.map(({ c, role }) => {
        const { sources, covered } = fitSources(c, merged);
        return {
          authorId: c.authorId,
          name: c.name,
          displayName: displayName(c),
          institution: c.institution,
          role,
          papers: c.topPapers.map((p) => ({ id: p.id, title: p.title, url: p.url })),
          sources,
          covered,
        };
      }),
    };
    postJSON<FitResult>("/api/fit", body, 240_000)
      .then((r) => alive && setState({ key, value: r.status === "ok" ? { state: "ok", data: r } : { state: "failed" } }))
      .catch(() => alive && setState({ key, value: { state: "failed" } }));
    return () => {
      alive = false;
    };
    // key가 결과·후보 구성을 대표한다 (출처가 다 들어온 뒤 한 번)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!result) return { state: "idle" } as Async<FitResult>;
  if (!key) return { state: "loading" } as Async<FitResult>;
  return state.key === key ? state.value : ({ state: "loading" } as Async<FitResult>);
}
