/**
 * 장비 보유 현황 (ZEUS). 검색 결과가 나온 뒤 화면이 따로 부른다 → 후보 검색 시간에 영향 없음.
 *
 * 1) 장비 항목별: 전국 등록 수, 외부 이용 가능(공동활용허용·서비스) 수, 외부 이용 가능 장비 상위 5개 상세
 * 2) 후보 소속 기관별: "장비명 + 한국어 기관명"으로 검색해 그 기관이 보유한 장비만 남긴다
 * 2-1) 같은 기관 장비의 구축 과제 연구책임자가 OpenAlex 후보 영문 이름과 표기가 맞으면 그 후보에 연결
 * 3) 국내(DBpia) 후보 이름별: "장비명 + 이름"으로 검색하고, 상세의 연구책임자가 그 이름과 같을 때만 남긴다
 */
import { koreanInstitutionNames, koreanNameMatches, sameOrgan } from "./kornames";
import { fetchEquipDetail, searchEquip, zeusKeyword, zeusSearchUrl, type ZeusDetail, type ZeusListItem } from "./zeus";

const TOP_DETAILS = 5;

export type EquipmentRequest = {
  items: { label: string; inferred: boolean }[];
  institutions: { id: string; name: string }[]; // OpenAlex 기관 ID·영문명
  names: string[]; // 국내 후보의 한국어 이름
  candidates?: { authorId: string; name: string; institutionId: string }[]; // OpenAlex 후보 (연구책임자 이름 매칭용)
};

export type ItemEquipment = {
  label: string;
  inferred: boolean;
  keyword: string;
  total: number;
  openTotal: number;
  searchUrl: string;
  top: ZeusDetail[];
};

export type InstitutionEquipment = {
  koName: string;
  perItem: { label: string; items: ZeusListItem[]; more: boolean; searchUrl: string }[];
};

export type NameEquipment = { label: string; equip: ZeusDetail }[];

export type EquipmentResult = {
  status: "ok" | "failed";
  items: ItemEquipment[];
  byInstitution: Record<string, InstitutionEquipment>;
  byName: Record<string, NameEquipment>;
  /** OpenAlex 후보(authorId)별: 같은 기관 장비 중 구축 과제 연구책임자 이름 표기가 맞는 것 */
  byCandidate: Record<string, NameEquipment>;
};

async function itemOverview(label: string, inferred: boolean): Promise<ItemEquipment> {
  const keyword = zeusKeyword(label);
  const [all, open] = await Promise.all([searchEquip(keyword), searchEquip(keyword, { openUse: true })]);
  // 첫 페이지(정확도순 10건) 안에서: 장비명에 검색어가 있는 것 → 공동활용서비스(정식 외부 이용) → 최근 취득 순
  const compact = (x: string) => x.replace(/\s/g, "");
  const named = (x: ZeusListItem) => Number(compact(x.name).includes(compact(keyword)));
  const service = (x: ZeusListItem) => Number(x.scope.includes("서비스"));
  const ranked = [...open.items].sort(
    (a, b) => named(b) - named(a) || service(b) - service(a) || b.acquired.localeCompare(a.acquired),
  );
  const details = await Promise.all(ranked.slice(0, TOP_DETAILS).map((i) => fetchEquipDetail(i.id)));
  return {
    label,
    inferred,
    keyword,
    total: all.total,
    openTotal: open.total,
    searchUrl: zeusSearchUrl(keyword, true),
    top: details.filter((d): d is ZeusDetail => d !== null),
  };
}

export async function lookupEquipment(req: EquipmentRequest): Promise<EquipmentResult> {
  const items = req.items.slice(0, 4);
  if (items.length === 0) return { status: "ok", items: [], byInstitution: {}, byName: {}, byCandidate: {} };

  const overviewP = Promise.allSettled(items.map((it) => itemOverview(it.label, it.inferred)));

  // 후보 소속 기관별
  const instIds = [...new Set(req.institutions.map((i) => i.id).filter(Boolean))].slice(0, 15);
  const koNames = await koreanInstitutionNames(instIds);
  const byInstitution: Record<string, InstitutionEquipment> = {};
  await Promise.all(
    [...koNames].map(async ([id, koName]) => {
      const perItem = await Promise.all(
        items.map(async (it) => {
          const keyword = `${zeusKeyword(it.label)} ${koName}`;
          try {
            const r = await searchEquip(keyword);
            // 설명에 기관명이 나올 뿐인 다른 기관 장비는 뺀다
            const mine = r.items.filter((x) => sameOrgan(x.organ, koName));
            return { label: it.label, items: mine, more: r.total > r.items.length, searchUrl: zeusSearchUrl(keyword, false) };
          } catch {
            return { label: it.label, items: [], more: false, searchUrl: zeusSearchUrl(keyword, false) };
          }
        }),
      );
      if (perItem.some((p) => p.items.length)) byInstitution[id] = { koName, perItem };
    }),
  );

  // OpenAlex 후보: 소속 기관 장비 상위 몇 대의 상세에서 연구책임자 이름 표기가 맞는지
  const byCandidate: Record<string, NameEquipment> = {};
  await Promise.all(
    (req.candidates ?? []).slice(0, 15).map(async (c) => {
      const inst = byInstitution[c.institutionId];
      if (!inst) return;
      const found: NameEquipment = [];
      for (const p of inst.perItem) {
        const details = await Promise.all(p.items.slice(0, 4).map((x) => fetchEquipDetail(x.id)));
        for (const d of details) if (d?.pi && koreanNameMatches(d.pi, c.name)) found.push({ label: p.label, equip: d });
      }
      if (found.length) byCandidate[c.authorId] = found;
    }),
  );

  // 국내 후보 이름별 (연구책임자 이름이 정확히 같을 때만)
  const byName: Record<string, NameEquipment> = {};
  const names = [...new Set(req.names.map((n) => n.trim()).filter((n) => /^[가-힣]{2,4}$/.test(n)))].slice(0, 5);
  await Promise.all(
    names.map(async (name) => {
      const found: NameEquipment = [];
      for (const it of items) {
        try {
          const r = await searchEquip(`${zeusKeyword(it.label)} ${name}`);
          const details = await Promise.all(r.items.slice(0, 3).map((x) => fetchEquipDetail(x.id)));
          for (const d of details) if (d && d.pi === name) found.push({ label: it.label, equip: d });
        } catch {
          // 이 항목만 빠진다
        }
      }
      if (found.length) byName[name] = found;
    }),
  );

  const overview = await overviewP;
  if (overview.every((o) => o.status === "rejected")) {
    return { status: "failed", items: [], byInstitution, byName, byCandidate };
  }
  return {
    status: "ok",
    items: overview.flatMap((o) => (o.status === "fulfilled" ? [o.value] : [])),
    byInstitution,
    byName,
    byCandidate,
  };
}
