"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Minus } from "lucide-react";
import type { Candidate, CheckItem, DomesticCandidate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { KIND_LABEL, TYPE_LABEL, type Async, type SideData } from "./data";
import type { EvidenceTable } from "./evidence";
import { Flag, FitLevel, Inferred, SOURCE, SourceMark, Spinner } from "./marks";
import { candidateView, domesticView, itemCell } from "./model";

export const TOP = 5;

/* ───────── 칸 ───────── */

function ItemCell({ table, label }: { table: EvidenceTable; label: string }) {
  const { hits, pending, notes } = itemCell(table, label);
  if (hits.length === 0) {
    if (pending) return <Spinner label="출처 확인 중" />;
    return (
      <span className="text-border" title="공개 자료에서 근거를 찾지 못함">
        <Minus className="size-4" aria-hidden="true" />
        <span className="sr-only">근거 못 찾음</span>
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">
          {hits.map((h) => (
            <SourceMark key={h} source={h} />
          ))}
          {pending && <Spinner className="size-3" />}
          <span className="sr-only">{hits.map((h) => SOURCE[h].label).join(", ")}에서 근거</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-1 text-left">
        {hits.map((h, i) => (
          <span key={h} className="block leading-5">
            <b className="font-medium">{SOURCE[h].short}</b> · {notes[i]}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function ProjectsCell({ async, n }: { async: Async<unknown>; n: number }) {
  if (async.state === "loading" || async.state === "idle") return <Spinner label="국가과제 확인 중" />;
  if (async.state === "failed")
    return (
      <span className="text-xs text-muted-foreground" title="국가과제 조회 실패">
        조회 실패
      </span>
    );
  if (!n)
    return (
      <span className="text-border" title="이름·기관이 맞는 최근 국가과제 없음">
        <Minus className="size-4" aria-hidden="true" />
        <span className="sr-only">없음</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <SourceMark source="ntis" />
      <span className="text-sm text-foreground tabular">{n}건</span>
    </span>
  );
}

function ItemHead({ item }: { item: CheckItem }) {
  return (
    <TableHead className="h-auto max-w-32 min-w-20 py-2.5 align-bottom whitespace-normal" title={item.label}>
      <span className="line-clamp-3 text-[13px] leading-5 font-medium text-foreground">{item.label}</span>
      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
        {KIND_LABEL[item.kind]}
        {item.inferred && <Inferred />}
      </span>
    </TableHead>
  );
}

function Rank({ n }: { n: number }) {
  return (
    <span
      className={cn("font-serif tabular", n <= TOP ? "text-lg font-semibold text-primary" : "text-sm text-muted-foreground")}
      aria-label={`${n}위`}
    >
      {n}
    </span>
  );
}

/** 후보 이름 아래 한 줄: 기관 · 유형 · 시·도 */
export function orgLine(c: Candidate) {
  return [c.institution, TYPE_LABEL[c.institutionType] ?? c.institutionType, c.sido].filter(Boolean).join(" · ");
}

export function CandidateFlags({ c, full = false }: { c: Candidate; full?: boolean }) {
  const a = c.affiliation;
  return (
    <>
      {a?.status === "current" && full && (
        <Flag tone="ok" title="OpenAlex 저자 기록에서 이 기관 소속으로 최근 논문이 있습니다">
          현재 소속 확인{a.lastYear ? ` (${a.lastYear})` : ""}
        </Flag>
      )}
      {a?.status === "stale" && (
        <Flag tone="warn" title={a.note ?? "이 기관 소속 논문이 한동안 없습니다. 이동·은퇴했을 수 있습니다."}>
          최근 소속 불확실{a.lastYear ? ` (마지막 ${a.lastYear})` : ""}
        </Flag>
      )}
      {!c.koreanName && <Flag title="국적 정보가 없어 이름 표기로 추정했습니다">외국인 추정</Flag>}
    </>
  );
}

/* ───────── 지도교수 후보 표 (OpenAlex) ───────── */

export function CandidateTable({
  candidates,
  items,
  side,
  onOpen,
}: {
  candidates: Candidate[];
  items: CheckItem[];
  side: SideData;
  onOpen: (c: Candidate, rank: number) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const top = candidates.slice(0, TOP);
  const more = candidates.slice(TOP);
  const visible = showMore ? candidates : top;
  const projAsync = side.projects;

  const moreToggle = more.length > 0 && (
    <button
      type="button"
      onClick={() => setShowMore((v) => !v)}
      aria-expanded={showMore}
      className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden="true" />
      {showMore ? "상위 5명만 보기" : `후보 ${more.length}명 더 보기`}
    </button>
  );

  return (
    <>
      {/* 넓은 화면: 표 */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table className="text-sm">
          <caption className="sr-only">지도교수 후보. 행을 누르면 근거 상세가 열립니다.</caption>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 min-w-64 shadow-[1px_0_0_var(--border)] bg-[#f6f5f0] pl-4 text-xs">순위 · 후보</TableHead>
              <TableHead className="w-28 text-xs" title="연구 질문과 가장 가까운 논문의 유사도">
                주제 적합
              </TableHead>
              <TableHead className="w-28 text-xs" title="쓰려는 방법·장비와 가장 가까운 논문의 유사도">
                방법 적합
              </TableHead>
              {items.map((i) => (
                <ItemHead key={i.label} item={i} />
              ))}
              <TableHead className="w-24 text-xs">국가과제</TableHead>
              <TableHead className="w-8 pr-3">
                <span className="sr-only">열기</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((c, idx) => {
              const v = candidateView(c, side);
              const rank = idx + 1;
              return (
                <Fragment key={c.authorId}>
                  {rank === TOP + 1 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={items.length + 5} className="bg-muted/40 py-2 pl-4 text-xs text-muted-foreground">
                        6위부터는 연구실 페이지를 따로 확인하지 않았습니다.
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    onClick={() => onOpen(c, rank)}
                    className="group cursor-pointer"
                  >
                    <TableCell className="sticky left-0 z-10 shadow-[1px_0_0_var(--border)] bg-card group-hover:bg-[#f4f3ee] py-3 pl-4 align-top whitespace-normal">
                      <div className="flex gap-3">
                      <span className="w-5 shrink-0 pt-0.5 text-center">
                        <Rank n={rank} />
                      </span>
                      <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(c, rank);
                        }}
                        className="text-left text-[15px] font-semibold text-foreground underline-offset-4 group-hover:text-primary group-hover:underline focus-visible:underline"
                      >
                        {c.name}
                        {v.ko && v.ko.name !== c.name && <span className="ml-1.5 font-normal text-foreground/70" title={`한글 이름: ${v.ko.source}`}>{v.ko.name}</span>}
                      </button>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{orgLine(c)}</p>
                      {(c.affiliation?.status === "stale" || !c.koreanName) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <CandidateFlags c={c} />
                        </div>
                      )}
                      </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <FitLevel label="주제" level={c.fit} score={c.T} />
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <FitLevel label="방법" level={c.methodFit} score={c.M} />
                    </TableCell>
                    {items.map((i) => (
                      <TableCell key={i.label} className="align-top pt-3.5">
                        <ItemCell table={v.table} label={i.label} />
                      </TableCell>
                    ))}
                    <TableCell className="align-top pt-3.5">
                      <ProjectsCell async={projAsync} n={v.projects?.length ?? 0} />
                    </TableCell>
                    <TableCell className="pr-3 align-top pt-4 text-muted-foreground">
                      <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        {moreToggle && <div className="border-t border-border">{moreToggle}</div>}
      </div>

      {/* 좁은 화면: 카드 */}
      <ol className="space-y-2.5 md:hidden">
        {visible.map((c, idx) => {
          const v = candidateView(c, side);
          const rank = idx + 1;
          return (
            <li key={c.authorId}>
              {rank === TOP + 1 && <p className="mb-2.5 px-1 pt-2 text-xs text-muted-foreground">6위부터는 연구실 페이지를 따로 확인하지 않았습니다.</p>}
              <MobileRow
                onOpen={() => onOpen(c, rank)}
                rank={<Rank n={rank} />}
                title={
                  <>
                    {c.name}
                    {v.ko && v.ko.name !== c.name && <span className="ml-1.5 font-normal text-foreground/70" title={`한글 이름: ${v.ko.source}`}>{v.ko.name}</span>}
                  </>
                }
                sub={orgLine(c)}
                flags={(c.affiliation?.status === "stale" || !c.koreanName) && <CandidateFlags c={c} />}
                fit={{ fit: c.fit, T: c.T, methodFit: c.methodFit, M: c.M }}
                items={items}
                table={v.table}
                projects={<ProjectsCell async={projAsync} n={v.projects?.length ?? 0} />}
              />
            </li>
          );
        })}
        {moreToggle && <li className="rounded-xl border border-border bg-card">{moreToggle}</li>}
      </ol>
    </>
  );
}

function MobileRow({
  onOpen,
  rank,
  title,
  sub,
  flags,
  fit,
  items,
  table,
  projects,
}: {
  onOpen: () => void;
  rank?: ReactNode;
  title: ReactNode;
  sub: string;
  flags?: ReactNode;
  fit: { fit: Candidate["fit"]; T: number; methodFit: Candidate["fit"]; M: number };
  items: CheckItem[];
  table: EvidenceTable;
  projects: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-input active:bg-muted/50"
    >
      <span className="flex items-start gap-3">
        {rank && <span className="w-5 shrink-0 pt-0.5 text-center">{rank}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{sub}</span>
          {flags && <span className="mt-1.5 flex flex-wrap gap-1">{flags}</span>}
        </span>
        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
        <span className="block">
          <span className="block text-[11px] text-muted-foreground">주제 적합</span>
          <FitLevel label="주제" level={fit.fit} score={fit.T} />
        </span>
        <span className="block">
          <span className="block text-[11px] text-muted-foreground">방법 적합</span>
          <FitLevel label="방법" level={fit.methodFit} score={fit.M} />
        </span>
      </span>
      <span className="mt-3 flex flex-col gap-1.5">
        {items.map((i) => (
          <span key={i.label} className="flex min-h-6 items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-1.5 text-foreground/80">
              <span className="truncate">{i.label}</span>
              {i.inferred && <Inferred />}
            </span>
            <ItemCell table={table} label={i.label} />
          </span>
        ))}
        <span className="flex min-h-6 items-center justify-between gap-3 text-[13px]">
          <span className="text-foreground/80">국가과제</span>
          {projects}
        </span>
      </span>
    </button>
  );
}

/* ───────── 국내 학술지 표 (DBpia) ───────── */

export function DomesticTable({
  candidates,
  items,
  side,
  onOpen,
}: {
  candidates: DomesticCandidate[];
  items: CheckItem[];
  side: SideData;
  onOpen: (c: DomesticCandidate) => void;
}) {
  const sub = (c: DomesticCandidate) =>
    [c.fields.length ? c.fields.join(" · ") : "연구분야 정보 없음", c.paperCount ? `DBpia 논문 ${c.paperCount}편` : null].filter(Boolean).join(" · ");
  const flags = (c: DomesticCandidate) => (
    <>
      <Flag title="DBpia는 소속을 공개하지 않습니다">소속 미확인</Flag>
      {!c.koreanName && <Flag title="국적 정보가 없어 이름 표기로 추정했습니다">외국인 추정</Flag>}
    </>
  );
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
        <Table className="text-sm">
          <caption className="sr-only">국내 학술지 후보. 행을 누르면 근거 상세가 열립니다.</caption>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-10 min-w-64 shadow-[1px_0_0_var(--border)] bg-[#f6f5f0] pl-4 text-xs">후보</TableHead>
              <TableHead className="w-28 text-xs">주제 적합</TableHead>
              <TableHead className="w-28 text-xs">방법 적합</TableHead>
              {items.map((i) => (
                <ItemHead key={i.label} item={i} />
              ))}
              <TableHead className="w-24 text-xs">국가과제</TableHead>
              <TableHead className="w-8 pr-3">
                <span className="sr-only">열기</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => {
              const v = domesticView(c, side);
              return (
                <TableRow key={c.ancId} onClick={() => onOpen(c)} className="group cursor-pointer">
                  <TableCell className="sticky left-0 z-10 shadow-[1px_0_0_var(--border)] bg-card group-hover:bg-[#f4f3ee] py-3 pl-4 align-top whitespace-normal">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(c);
                      }}
                      className="text-left text-[15px] font-semibold text-foreground underline-offset-4 group-hover:text-primary group-hover:underline"
                    >
                      {c.name}
                      {c.nameEn && c.nameEn !== c.name && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.nameEn}</span>}
                    </button>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{sub(c)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">{flags(c)}</div>
                  </TableCell>
                  <TableCell className="align-top pt-4">
                    <FitLevel label="주제" level={c.fit} score={c.T} />
                  </TableCell>
                  <TableCell className="align-top pt-4">
                    <FitLevel label="방법" level={c.methodFit} score={c.M} />
                  </TableCell>
                  {items.map((i) => (
                    <TableCell key={i.label} className="align-top pt-3.5">
                      <ItemCell table={v.table} label={i.label} />
                    </TableCell>
                  ))}
                  <TableCell className="align-top pt-3.5">
                    <ProjectsCell async={side.projects} n={v.projects?.length ?? 0} />
                  </TableCell>
                  <TableCell className="pr-3 align-top pt-4 text-muted-foreground">
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ol className="space-y-2.5 md:hidden">
        {candidates.map((c) => {
          const v = domesticView(c, side);
          return (
            <li key={c.ancId}>
              <MobileRow
                onOpen={() => onOpen(c)}
                title={
                  <>
                    {c.name}
                    {c.nameEn && c.nameEn !== c.name && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.nameEn}</span>}
                  </>
                }
                sub={sub(c)}
                flags={flags(c)}
                fit={{ fit: c.fit, T: c.T, methodFit: c.methodFit, M: c.M }}
                items={items}
                table={v.table}
                projects={<ProjectsCell async={side.projects} n={v.projects?.length ?? 0} />}
              />
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ───────── 범례 ───────── */

export function SourceLegend({ labsShown }: { labsShown: boolean }) {
  const list = (["paper", "lab", "zeusInst", "zeusPi", "ntis"] as const).filter((s) => s !== "lab" || labsShown);
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="출처 표시 범례">
      {list.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <SourceMark source={s} className="size-4 rounded-[4px] [&_svg]:size-2.5" />
          {SOURCE[s].label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <Minus className="size-4 text-border" aria-hidden="true" />
        공개 자료에서 근거 못 찾음 (못 한다는 뜻은 아님)
      </li>
    </ul>
  );
}
