/**
 * 후보 한 명에 대해 따로 불러온 출처(연구실·ZEUS·NTIS)를 모아 근거표를 만든다.
 * 표의 행과 오른쪽 상세(Sheet)가 같은 계산을 쓴다.
 */
import type { Candidate, DomesticCandidate, LabPage, NtisProject } from "@/lib/types";
import type { InstitutionEquipment, NameEquipment } from "@/lib/equipment";
import type { Async, SideData } from "./data";
import { buildEvidence, type EvidenceCol, type EvidenceTable } from "./evidence";

export type CandidateView = {
  table: EvidenceTable;
  lab: LabPage | undefined;
  inst: InstitutionEquipment | undefined;
  piEquip: NameEquipment | undefined;
  projects: NtisProject[] | undefined;
};

export function candidateView(c: Candidate, side: SideData): CandidateView {
  const labsOk = side.labs.state === "ok" ? side.labs.data : null;
  const labEnabled = side.labs.state === "loading" || labsOk?.status === "ok";
  const lab = labsOk?.status === "ok" ? labsOk.byCandidate[c.authorId] : undefined;
  const eq = side.equip.state === "ok" ? side.equip.data : null;
  const inst = eq?.byInstitution[c.institutionId];
  const piEquip = eq?.byCandidate?.[c.authorId];
  const piEnabled = side.equip.state === "loading" || (!!eq && eq.byCandidate !== undefined);
  const projects = side.projects.state === "ok" ? side.projects.data.byCandidate[c.authorId] : undefined;
  const table = buildEvidence({
    items: c.items,
    lab: { async: side.labs, page: lab, enabled: labEnabled },
    inst: { async: side.equip, data: inst },
    pi: { async: side.equip, data: piEquip, enabled: piEnabled },
  });
  return { table, lab, inst, piEquip, projects };
}

export type DomesticView = { table: EvidenceTable; byName: NameEquipment | undefined; projects: NtisProject[] | undefined };

export function domesticView(c: DomesticCandidate, side: SideData): DomesticView {
  const eq = side.equip.state === "ok" ? side.equip.data : null;
  const byName = eq?.byName[c.name];
  const projects = side.projects.state === "ok" ? side.projects.data.byDomestic[c.name] : undefined;
  const table = buildEvidence({
    items: c.items,
    pi: { async: side.equip, data: byName, enabled: side.equip.state === "loading" || side.equip.state === "ok" },
  });
  return { table, byName, projects };
}

const CELL_COLS: EvidenceCol[] = ["paper", "lab", "zeusInst", "zeusPi"];

/** 표 한 칸: 이 요구 항목을 뒷받침하는 출처들 + 아직 확인 중인지 */
export function itemCell(t: EvidenceTable, label: string) {
  const row = t.rows.find((r) => r.item.label === label);
  if (!row) return { hits: [] as EvidenceCol[], pending: false, notes: [] as string[] };
  const hits = CELL_COLS.filter((c) => row.cells[c]?.s === "yes");
  const pending = CELL_COLS.some((c) => row.cells[c]?.s === "loading");
  const notes = hits.map((h) => {
    const cell = row.cells[h];
    return cell && cell.s === "yes" ? cell.note : "";
  });
  return { hits, pending, notes };
}

export const isPending = (a: Async<unknown>) => a.state === "loading";
