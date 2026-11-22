/**
 * 요구 항목(방법·장비) × 출처 근거표 계산.
 * 데이터에 있는 것만 ✓로 바꾼다. 아직 안 왔으면 loading, 해당 없음은 na.
 */
import type { InstitutionEquipment, NameEquipment } from "@/lib/equipment";
import type { ItemResult, LabPage } from "@/lib/types";
import type { Async } from "./data";
import type { Source } from "./ui";

export type Cell =
  | { s: "yes"; note: string; href?: string }
  | { s: "no"; note: string }
  | { s: "loading" }
  | { s: "na" };

export type EvidenceCol = Exclude<Source, "ntis">;

export type EvidenceRow = { item: ItemResult; cells: Partial<Record<EvidenceCol, Cell>> };

export type EvidenceTable = { cols: EvidenceCol[]; rows: EvidenceRow[] };

type Inputs = {
  items: ItemResult[];
  /** 연구실 페이지: undefined = 이 후보는 조회 대상 아님 */
  lab?: { async: Async<unknown>; page: LabPage | undefined; enabled: boolean };
  /** 소속 기관 ZEUS 장비 (OpenAlex 후보만) */
  inst?: { async: Async<unknown>; data: InstitutionEquipment | undefined };
  /** 이 사람이 구축 과제 연구책임자인 ZEUS 장비 */
  pi?: { async: Async<unknown>; data: NameEquipment | undefined; enabled: boolean };
};

const pending = (a: Async<unknown>) => a.state === "loading" || a.state === "idle";

export function buildEvidence({ items, lab, inst, pi }: Inputs): EvidenceTable {
  const hasEquip = items.some((i) => i.kind === "equipment");
  const cols: EvidenceCol[] = ["paper"];
  if (lab && lab.enabled) cols.push("lab");
  if (inst && hasEquip && inst.async.state !== "failed") cols.push("zeusInst");
  if (pi && hasEquip && pi.enabled) cols.push("zeusPi");

  const rows = items.map((item) => {
    const cells: EvidenceRow["cells"] = {};
    cells.paper = item.evidence
      ? { s: "yes", note: item.evidence.onTopic ? "이 주제 논문 초록에 적혀 있음" : "같은 연구자의 다른 주제 논문 초록에 적혀 있음", href: item.evidence.url }
      : { s: "no", note: "초록에서 근거 문장을 찾지 못함" };

    if (cols.includes("lab") && lab) {
      if (pending(lab.async)) cells.lab = { s: "loading" };
      else if (!lab.page) cells.lab = { s: "no", note: "연구실 페이지를 찾지 못함" };
      else {
        const hit = lab.page.equipment.find((e) => e.label === item.label);
        cells.lab = hit
          ? { s: "yes", note: `연구실 페이지: “${hit.snippet}”`, href: lab.page.url }
          : item.kind === "method"
            ? { s: "na" }
            : { s: "no", note: "연구실 페이지에 적혀 있지 않음" };
      }
    }

    if (cols.includes("zeusInst") && inst) {
      if (item.kind !== "equipment") cells.zeusInst = { s: "na" };
      else if (pending(inst.async)) cells.zeusInst = { s: "loading" };
      else {
        const p = inst.data?.perItem.find((x) => x.label === item.label);
        cells.zeusInst =
          p && p.items.length
            ? { s: "yes", note: `소속 기관에 ${p.items.length}대${p.more ? " 이상" : ""} 등록 (기관 전체 기준)`, href: p.searchUrl }
            : { s: "no", note: "소속 기관 등록 장비에서 찾지 못함" };
      }
    }

    if (cols.includes("zeusPi") && pi) {
      if (item.kind !== "equipment") cells.zeusPi = { s: "na" };
      else if (pending(pi.async)) cells.zeusPi = { s: "loading" };
      else {
        const e = pi.data?.find((x) => x.label === item.label);
        cells.zeusPi = e
          ? { s: "yes", note: `연구책임자 과제로 구축: ${e.equip.name} (${e.equip.organ})`, href: e.equip.url }
          : { s: "no", note: "이 사람이 책임자인 과제의 장비에서 찾지 못함" };
      }
    }
    return { item, cells };
  });

  return { cols, rows };
}

/** 근거가 하나라도 있는 요구 항목 수. 기관 전체 기준 장비(zeusInst)는 연구자 단위 근거가 아니라 따로 센다 */
export function coveredCount(t: EvidenceTable): { person: number; instOnly: number } {
  const yes = (r: EvidenceRow, cols: EvidenceCol[]) => cols.some((c) => r.cells[c]?.s === "yes");
  const person = t.rows.filter((r) => yes(r, ["paper", "lab", "zeusPi"])).length;
  const instOnly = t.rows.filter((r) => !yes(r, ["paper", "lab", "zeusPi"]) && yes(r, ["zeusInst"])).length;
  return { person, instOnly };
}
