export type NameFilter = "all" | "korean" | "other";
export type OrgFilter = "all" | "university" | "institute";

export function Filters({
  org,
  setOrg,
  name,
  setName,
  onlyEvidence,
  setOnlyEvidence,
  count,
}: {
  org: OrgFilter;
  setOrg: (v: OrgFilter) => void;
  name: NameFilter;
  setName: (v: NameFilter) => void;
  onlyEvidence: boolean;
  setOnlyEvidence: (v: boolean) => void;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
        <label className="inline-flex min-h-9 items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-primary)]"
            checked={onlyEvidence}
            onChange={(e) => setOnlyEvidence(e.target.checked)}
          />
          방법·장비 근거 있는 후보만
        </label>
        <span className="ml-auto font-mono text-xs tabular text-ink-3" aria-live="polite">
          {count}명
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-ink-3">
        한국인/외국인은 국적 정보가 없어 이름 표기로 추정한 값입니다. 연구소에는 출연연·국공립 연구기관·병원이 포함됩니다.
      </p>
    </div>
  );
}

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
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs font-medium text-ink-3">{label}</span>
      <span className="inline-flex rounded-lg bg-sunken p-0.5 ring-1 ring-inset ring-line">
        {options.map(([v, text]) => (
          <button
            type="button"
            key={v}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`min-h-8 rounded-md px-3 text-xs font-medium transition-colors ${
              value === v ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}
