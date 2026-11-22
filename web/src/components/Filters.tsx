"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type NameFilter = "all" | "korean" | "other";
export type OrgFilter = "all" | "university" | "institute";
/** "all" 또는 시·도 이름. "unknown" = 위치를 모르는 기관 */
export type RegionFilter = string;
/** 특정 장비가 확인된 후보만. person: 논문·연구실 페이지·본인 과제 장비 / institution: 소속 기관 보유(ZEUS)까지 포함 */
export type EquipFilter = { label: string; scope: "person" | "institution" };
export const NO_EQUIP_FILTER: EquipFilter = { label: "all", scope: "person" };

const SIDO_ORDER = ["서울", "경기", "인천", "강원", "대전", "세종", "충북", "충남", "광주", "전북", "전남", "대구", "경북", "부산", "울산", "경남", "제주"];

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={0}
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        aria-label={label}
        className="bg-card"
      >
        {options.map(([v, text]) => (
          <ToggleGroupItem
            key={v}
            value={v}
            className="h-8 px-3 text-xs data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
          >
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function Filters({
  org,
  setOrg,
  name,
  setName,
  onlyEvidence,
  setOnlyEvidence,
  region,
  setRegion,
  regionCounts,
  equip,
  setEquip,
  equipOptions,
  equipPending,
  count,
  total,
}: {
  org: OrgFilter;
  setOrg: (v: OrgFilter) => void;
  name: NameFilter;
  setName: (v: NameFilter) => void;
  onlyEvidence: boolean;
  setOnlyEvidence: (v: boolean) => void;
  region: RegionFilter;
  setRegion: (v: RegionFilter) => void;
  /** 다른 필터를 적용한 뒤 시·도별 후보 수 (null 키 = 지역 미상) */
  regionCounts: Map<string | null, number>;
  equip: EquipFilter;
  setEquip: (v: EquipFilter) => void;
  /** 이번 질문의 장비 항목 이름 */
  equipOptions: string[];
  /** 연구실 페이지·ZEUS를 아직 확인 중이면 결과가 늘어날 수 있다 */
  equipPending: boolean;
  count: number;
  total: number;
}) {
  const known = SIDO_ORDER.filter((s) => regionCounts.has(s));
  const unknown = regionCounts.get(null) ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <Segmented
        label="소속"
        value={org}
        onChange={setOrg}
        options={[
          ["all", "전체"],
          ["university", "대학교"],
          ["institute", "연구소"],
        ]}
      />
      <Segmented
        label="이름"
        value={name}
        onChange={setName}
        options={[
          ["all", "전체"],
          ["korean", "한국인"],
          ["other", "외국인"],
        ]}
      />
      <div className="flex items-center gap-2">
        <span id="region-label" className="text-xs font-medium text-muted-foreground">
          지역
        </span>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger size="sm" aria-labelledby="region-label" className="h-8 min-w-24 bg-card text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72">
            <SelectItem value="all">전국</SelectItem>
            {known.map((s) => (
              <SelectItem key={s} value={s}>
                {s} ({regionCounts.get(s)})
              </SelectItem>
            ))}
            {region !== "all" && region !== "unknown" && !known.includes(region) && <SelectItem value={region}>{region} (0)</SelectItem>}
            {unknown > 0 && <SelectItem value="unknown">지역 미상 ({unknown})</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {equipOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span id="equip-label" className="text-xs font-medium text-muted-foreground">
            장비
          </span>
          <Select value={equip.label} onValueChange={(label) => setEquip({ ...equip, label })}>
            <SelectTrigger size="sm" aria-labelledby="equip-label" className="h-8 min-w-28 bg-card text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              <SelectItem value="all">상관없음</SelectItem>
              {equipOptions.map((l) => (
                <SelectItem key={l} value={l}>
                  {l} 있는 곳만
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {equip.label !== "all" && (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              spacing={0}
              value={equip.scope}
              onValueChange={(v) => v && setEquip({ ...equip, scope: v as EquipFilter["scope"] })}
              aria-label="장비 확인 기준"
              className="bg-card"
            >
              <ToggleGroupItem
                value="person"
                title="논문 초록·연구실 페이지·본인이 책임자인 과제의 장비로 확인된 후보"
                className="h-8 px-3 text-xs data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
              >
                연구자 근거
              </ToggleGroupItem>
              <ToggleGroupItem
                value="institution"
                title="소속 기관이 ZEUS에 등록한 장비까지 포함 (그 연구실 장비라는 뜻은 아님)"
                className="h-8 px-3 text-xs data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
              >
                기관 보유 포함
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          {equip.label !== "all" && equipPending && <span className="text-xs text-muted-foreground">확인 중인 출처가 있어 늘어날 수 있음</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch id="only-ev" checked={onlyEvidence} onCheckedChange={setOnlyEvidence} />
        <Label htmlFor="only-ev" className="text-xs font-medium text-foreground/80">
          근거 있는 후보만
        </Label>
      </div>
      <span className="ml-auto text-xs text-muted-foreground tabular" aria-live="polite">
        {count === total ? `${total}명` : `${total}명 중 ${count}명`}
      </span>
    </div>
  );
}
