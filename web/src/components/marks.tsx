import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  FileText,
  House,
  Info,
  Landmark,
  Loader2,
  Microscope,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────── 출처 ───────── */

export type Source = "paper" | "lab" | "zeusInst" | "zeusPi" | "ntis";

export const SOURCE: Record<Source, { label: string; short: string; icon: LucideIcon; text: string; bg: string }> = {
  paper: { label: "논문 초록", short: "논문", icon: FileText, text: "text-src-paper", bg: "bg-src-paper" },
  lab: { label: "연구실 페이지", short: "연구실", icon: House, text: "text-src-lab", bg: "bg-src-lab" },
  zeusInst: { label: "소속 기관 장비 (ZEUS, 기관 전체 기준)", short: "기관 장비", icon: Building2, text: "text-src-zeus", bg: "bg-src-zeus" },
  zeusPi: { label: "연구책임자 과제 장비 (ZEUS)", short: "과제 장비", icon: Microscope, text: "text-src-zeus", bg: "bg-src-zeus" },
  ntis: { label: "국가과제 (NTIS)", short: "국가과제", icon: Landmark, text: "text-src-ntis", bg: "bg-src-ntis" },
};

/** 출처 표시: 색 + 아이콘. 옆에 글자가 없으면 sr-only 라벨을 붙인다 */
export function SourceMark({ source, className }: { source: Source; className?: string }) {
  const s = SOURCE[source];
  const Ico = s.icon;
  return (
    <span aria-hidden="true" className={cn("inline-grid size-5 shrink-0 place-items-center rounded-[5px] text-white", s.bg, className)}>
      <Ico className="size-3" strokeWidth={2.25} />
    </span>
  );
}

export function SourceLabel({ source, children, className }: { source: Source; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <SourceMark source={source} />
      {children ?? SOURCE[source].label}
    </span>
  );
}

/* ───────── 꼬리표 ───────── */

type FlagTone = "neutral" | "warn" | "ok";

const FLAG: Record<FlagTone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  warn: "bg-warn-soft text-warn ring-warn/20",
  ok: "bg-ok-soft text-ok ring-ok/20",
};

/** 추정·주의 꼬리표. 지우지 말 것 — 이 서비스는 추정을 추정이라고 말한다 */
export function Flag({ tone = "neutral", children, title, icon: Ico }: { tone?: FlagTone; children: ReactNode; title?: string; icon?: LucideIcon }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-[11px] leading-none font-medium whitespace-nowrap ring-1 ring-inset",
        FLAG[tone],
      )}
    >
      {Ico && <Ico className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Inferred() {
  return (
    <Flag tone="warn" title="학생이 입력하지 않아 시스템이 주제에서 추정한 항목입니다">
      추정
    </Flag>
  );
}

/* ───────── 링크·문단 ───────── */

export function ExtLink({ href, children, className, quiet = false }: { href: string; children: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "underline decoration-border decoration-1 underline-offset-[3px] transition-colors hover:decoration-current",
        quiet ? "text-muted-foreground hover:text-foreground" : "text-primary",
        className,
      )}
    >
      {children}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

/** 버튼 모양의 바깥 링크 */
export function LinkButton({ href, children, icon: Ico = ExternalLink, className }: { href: string; children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:border-input hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Ico className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}

/** 해석 주의 문구 */
export function Caveat({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex gap-1.5 text-xs leading-5 text-muted-foreground", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function WarnNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs leading-5 text-warn", className)}>
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <Loader2 className={cn("size-3.5 shrink-0 animate-spin text-muted-foreground", className)} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

/** 따로 불러오는 부분의 진행 중 표시 */
export function InlineLoading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="status" aria-live="polite" className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <Spinner />
      {children}
    </p>
  );
}

/** 빈 상태·실패 상태 — 조용한 상자 하나 */
export function Quiet({ children, icon: Ico = Info, className }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn("flex gap-2.5 rounded-lg border border-dashed border-input bg-card/60 px-4 py-3.5 text-sm leading-6 text-muted-foreground", className)}>
      <Ico className="mt-1 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function Highlight({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-mark px-0.5 text-foreground">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

/* ───────── 적합도 ───────── */

export type Level = "높음" | "중간" | "낮음";
const LEVEL_N: Record<Level, number> = { 낮음: 1, 중간: 2, 높음: 3 };

export const FIT_HELP =
  "가장 가까운 논문 한 편의 유사도로 정한 등급입니다 (0.55 이상 높음, 0.45 이상 중간). 숫자는 순위에 쓰는 점수로, 2·3번째 논문을 조금 더한 값입니다.";

/** 3칸 등급. 등급은 데이터 라벨 그대로, 막대로 점수를 꾸며내지 않는다 */
export function FitLevel({ level, score, label, className }: { level: Level; score: number; label: string; className?: string }) {
  const n = LEVEL_N[level] ?? 1;
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={FIT_HELP}>
      <span className="flex gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-1.5 rounded-[2px]",
              i <= n ? (level === "높음" ? "bg-primary" : level === "중간" ? "bg-primary/60" : "bg-muted-foreground/45") : "bg-border",
            )}
          />
        ))}
      </span>
      <span className="text-[13px] font-medium text-foreground">{level}</span>
      <span className="text-xs text-muted-foreground tabular">{score.toFixed(2)}</span>
      <span className="sr-only">
        {label} 적합도 {level}, 점수 {score.toFixed(2)}
      </span>
    </span>
  );
}
