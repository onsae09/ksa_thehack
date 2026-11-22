/**
 * 화면 쪽 데이터 헬퍼. (서버 로직은 src/lib — 여기서는 받아온 값을 보여주기 좋게만 다룬다)
 */
import type { EquipmentResult, NameEquipment } from "@/lib/equipment";
import type { DatasetsResult, LabPagesResult, ProjectsResult } from "@/lib/types";

/** 검색 결과가 나온 뒤 따로 불러오는 섹션의 상태 */
export type Async<T> = { state: "idle" } | { state: "loading" } | { state: "ok"; data: T } | { state: "failed" };

/** byCandidate(OpenAlex 후보별 과제 책임자 장비)는 새로 추가되는 필드라 없을 수도 있다 */
export type EquipData = EquipmentResult & { byCandidate?: Record<string, NameEquipment> };

export type SideData = {
  equip: Async<EquipData>;
  projects: Async<ProjectsResult>;
  labs: Async<LabPagesResult>;
  datasets: Async<DatasetsResult>;
};

export const IDLE_SIDE: SideData = {
  equip: { state: "idle" },
  projects: { state: "idle" },
  labs: { state: "idle" },
  datasets: { state: "idle" },
};

/** 요구 항목 종류 표시 */
export const KIND_LABEL: Record<string, string> = { method: "방법", equipment: "장비", data: "데이터" };

export async function postJSON<T>(url: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

export const TYPE_LABEL: Record<string, string> = {
  education: "대학",
  facility: "연구소",
  government: "국공립 연구기관",
  nonprofit: "비영리 연구기관",
  healthcare: "병원",
};

/** 원 단위 연구비 → "3.2억원" / "4,500만원" */
export function formatWon(won: number | null): string | null {
  if (won == null || !Number.isFinite(won) || won <= 0) return null;
  if (won >= 1e8) {
    const eok = won / 1e8;
    return `${eok >= 10 ? Math.round(eok).toLocaleString() : eok.toFixed(1)}억원`;
  }
  return `${Math.round(won / 1e4).toLocaleString()}만원`;
}

export function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z가-힣]/g, "");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
