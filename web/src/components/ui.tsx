import type { ReactNode } from "react";

/* ───────── 아이콘 (선 굵기 1.75, 24 격자 하나로 통일) ───────── */

const ICONS = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  dash: <path d="M7 12h10" />,
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8.5 8.5" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8v.1" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.5" />
      <path d="M7.5 9L12 4.5 16.5 9" />
      <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  file: (
    <>
      <path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  home: (
    <>
      <path d="M4.5 10.5L12 4.5l7.5 6V19a1 1 0 0 1-1 1h-4.5v-5h-4v5H5.5a1 1 0 0 1-1-1z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  x: <path d="M7 7l10 10M17 7L7 17" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {ICONS[name]}
    </svg>
  );
}

/* ───────── 링크 ───────── */

export function ExtLink({
  href,
  children,
  className = "",
  quiet = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  quiet?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`underline decoration-line-strong hover:decoration-current ${quiet ? "text-ink-3 hover:text-ink" : "text-primary"} ${className}`}
    >
      {children}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

/** 카드 상단의 링크 묶음용 버튼형 링크 */
export function LinkChip({ href, children, icon = "external" }: { href: string; children: ReactNode; icon?: IconName }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
    >
      <Icon name={icon} className="size-3.5" />
      {children}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

/* ───────── 배지 ───────── */

type Tone = "neutral" | "ok" | "warn" | "danger" | "primary" | "lab" | "zeus" | "ntis";

const TONE: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  ok: "bg-ok-soft text-ok ring-ok/25",
  warn: "bg-warn-soft text-warn ring-warn/25",
  danger: "bg-danger-soft text-danger ring-danger/25",
  primary: "bg-primary-soft text-primary ring-primary/20",
  lab: "bg-src-lab-soft text-src-lab ring-src-lab/25",
  zeus: "bg-src-zeus-soft text-src-zeus ring-src-zeus/25",
  ntis: "bg-src-ntis-soft text-src-ntis ring-src-ntis/25",
};

export function Badge({
  tone = "neutral",
  children,
  title,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  icon?: IconName;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap ring-1 ring-inset ${TONE[tone]}`}
    >
      {icon && <Icon name={icon} className="size-3" />}
      {children}
    </span>
  );
}

/** 시스템이 추정한 값. 항상 같은 모양으로 보이게 한다 */
export function Inferred() {
  return (
    <Badge tone="warn" title="학생이 입력하지 않아 시스템이 주제에서 추정한 항목입니다">
      추정
    </Badge>
  );
}

/* ───────── 출처 ───────── */

export type Source = "paper" | "lab" | "zeusInst" | "zeusPi" | "ntis";

export const SOURCE: Record<Source, { label: string; short: string; glyph: string; cls: string; soft: string }> = {
  paper: { label: "논문 초록", short: "논문", glyph: "논", cls: "bg-src-paper text-white", soft: "bg-src-paper-soft text-src-paper" },
  lab: { label: "연구실 페이지", short: "연구실", glyph: "실", cls: "bg-src-lab text-white", soft: "bg-src-lab-soft text-src-lab" },
  zeusInst: { label: "기관 보유 장비 (ZEUS)", short: "기관장비", glyph: "기", cls: "bg-src-zeus text-white", soft: "bg-src-zeus-soft text-src-zeus" },
  zeusPi: { label: "과제 구축 장비 (ZEUS)", short: "과제장비", glyph: "책", cls: "bg-src-zeus text-white", soft: "bg-src-zeus-soft text-src-zeus" },
  ntis: { label: "국가과제 (NTIS)", short: "국가과제", glyph: "과", cls: "bg-src-ntis text-white", soft: "bg-src-ntis-soft text-src-ntis" },
};

/** 출처 표시: 색 + 글자. 색만으로 구분하지 않는다 */
export function SourceGlyph({ source, dim = false }: { source: Source; dim?: boolean }) {
  const s = SOURCE[source];
  return (
    <span
      aria-hidden="true"
      className={`inline-grid size-4 place-items-center rounded-[3px] text-[10px] leading-none font-bold ${dim ? s.soft : s.cls}`}
    >
      {s.glyph}
    </span>
  );
}

export function SourceLabel({ source, children }: { source: Source; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
      <SourceGlyph source={source} />
      {children ?? SOURCE[source].label}
    </span>
  );
}

/* ───────── 문단 단위 ───────── */

/** 해석 주의 문구. 지우지 말 것 — 이 서비스의 원칙(근거·추정 구분)을 화면에 남긴다 */
export function Caveat({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex gap-1.5 text-xs leading-5 text-ink-3 ${className}`}>
      <Icon name="info" className="mt-0.5 size-3.5" />
      <span>{children}</span>
    </p>
  );
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs leading-5 text-warn">
      <Icon name="alert" className="mt-0.5 size-3.5" />
      <span>{children}</span>
    </p>
  );
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header id={id} className="mb-4 scroll-mt-4 border-t border-ink pt-4">
      {eyebrow && <div className="mb-1 text-xs font-medium text-ink-3">{eyebrow}</div>}
      <h2 className="font-serif text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h2>
      {children && <div className="mt-2 max-w-2xl text-sm leading-6 text-ink-2">{children}</div>}
    </header>
  );
}

/** 따로 불러오는 섹션의 진행 중 표시 (짧은 한 줄 + 가는 진행 막대) */
export function InlineLoading({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-ink-3">
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-sunken">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-primary/60" />
      </span>
      {children}
    </div>
  );
}

/** 실패해도 페이지는 그대로. 무엇이 빠졌는지만 조용히 알린다 */
export function SectionFailed({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-3">
      <Icon name="x" className="size-3.5" />
      {children}
    </p>
  );
}

/** 접었다 펴는 하위 블록 */
export function Fold({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-line">
      <summary className="flex min-h-11 items-center gap-2 py-2 text-sm font-semibold text-ink hover:text-primary">
        <Icon name="chevron" className="size-4 text-ink-3 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="pb-4 pl-6">{children}</div>
    </details>
  );
}

export function Highlight({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-mark px-0.5 text-ink">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}
