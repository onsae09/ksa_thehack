"use client";

import { useState } from "react";
import { ChevronDown, CircleCheck, CircleDashed, Info, Pin, Scale, SearchX, Users } from "lucide-react";
import type { FitPoint, FitResult } from "@/lib/fit";
import type { Candidate, SearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Async } from "./data";
import type { AdvisorData, PlannedAdvisor } from "./insight";
import { advisorIndex } from "./insight";
import { TOP } from "./CandidateTable";
import { ExtLink, FitLevel, Flag, InlineLoading } from "./marks";

const KIND_LABEL: Record<FitPoint["kind"], string> = {
  abstract: "논문 초록",
  fulltext: "논문 본문",
  lab: "연구실 페이지",
  ntis: "국가과제",
  zeus: "ZEUS 장비",
  title: "논문 제목",
};

/** 인용 하나 (원문 그대로, 출처 링크) */
function Cite({ p }: { p: FitPoint }) {
  return (
    <span className="mt-1 block border-l-2 border-src-paper/35 pl-3 font-serif text-[13px] leading-6 text-foreground/80">
      “{p.quote}”
      <span className="mt-0.5 block font-sans text-[11px] leading-5 text-muted-foreground">
        {KIND_LABEL[p.kind]} ·{" "}
        <ExtLink href={p.url} quiet className="break-all">
          {p.title}
        </ExtLink>
      </span>
    </span>
  );
}

/* ───────── 상세(Sheet) 안: 이 후보의 맞는 점 / 빈틈 ───────── */

export function FitSection({ fit, authorId }: { fit: Async<FitResult> | undefined; authorId: string }) {
  if (!fit || fit.state === "idle") return null;
  if (fit.state === "loading") return <InlineLoading>다른 출처를 다 모은 뒤 맞는 점·빈틈을 정리하는 중 (상위 5명 + 연락 예정 교수)</InlineLoading>;
  if (fit.state === "failed") return <p className="text-xs text-muted-foreground">맞는 점·빈틈 정리에 실패했습니다. 아래 근거를 직접 확인하세요.</p>;
  const c = fit.data.candidates[authorId];
  if (!c) return <p className="text-xs text-muted-foreground">이 후보는 정리 대상(상위 5명 + 연락 예정 교수)이 아닙니다. 아래 근거를 직접 확인하세요.</p>;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ok">
          <CircleCheck className="size-3.5" aria-hidden="true" />
          맞는 점
        </p>
        {c.fits.length === 0 ? (
          <p className="text-xs text-muted-foreground">원문 인용으로 확인되는 맞는 점이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {c.fits.map((f) => (
              <li key={f.quote} className="text-sm leading-6 text-foreground">
                {f.point}
                <Cite p={f} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-warn">
          <CircleDashed className="size-3.5" aria-hidden="true" />
          빈틈
        </p>
        {c.gaps.length === 0 && c.missing.length === 0 ? (
          <p className="text-xs text-muted-foreground">모은 근거에서 드러난 빈틈은 없습니다 (없다는 보장은 아닙니다).</p>
        ) : (
          <ul className="space-y-3">
            {c.gaps.map((g, i) => (
              <li key={i} className="text-sm leading-6 text-foreground">
                {g.point}
                {g.item && <span className="ml-1.5 text-xs text-muted-foreground">(근거 못 찾은 항목: {g.item})</span>}
                {g.quote && (
                  // 빈틈의 인용은 "없다"의 증거가 아니라, 대신 확인된 이 교수의 연구 방향이다
                  <span className="mt-1 block">
                    <span className="text-xs text-muted-foreground">대신 확인된 연구 방향</span>
                    <Cite p={g.quote} />
                  </span>
                )}
              </li>
            ))}
            {c.missing.filter((m) => !c.gaps.some((g) => g.item === m)).length > 0 && (
              <li className="text-xs leading-5 text-muted-foreground">
                초록·본문·연구실 페이지·과제 장비 어디에서도 근거를 못 찾은 항목:{" "}
                {c.missing.filter((m) => !c.gaps.some((g) => g.item === m)).join(", ")}
              </li>
            )}
          </ul>
        )}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        이미 모은 근거(초록·본문 {c.fulltextChecked}편·연구실 페이지·NTIS·ZEUS)만으로 Claude가 정리했고, 인용은 원문과 글자 단위로 대조해 확인된 것만 남겼습니다
        {c.dropped > 0 ? ` (확인되지 않은 ${c.dropped}개는 뺌)` : ""}.
      </p>
    </div>
  );
}

/* ───────── 표 위: 공동 지도 조합 제안 (한 줄 요약 + 펼치면 근거) ───────── */

export function FitSummary({ fit, nameOf }: { fit: Async<FitResult>; nameOf: (authorId: string) => string | null }) {
  const [open, setOpen] = useState(false);
  if (fit.state === "idle") return null;
  if (fit.state === "loading")
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <InlineLoading>상위 후보의 맞는 점·빈틈과 공동 지도 조합을 근거 원문으로 정리하는 중</InlineLoading>
      </div>
    );
  if (fit.state === "failed")
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        맞는 점·빈틈 정리에 실패했습니다. 후보를 눌러 근거를 직접 확인하세요.
      </div>
    );
  const combo = fit.data.combo;
  return (
    <section aria-label="공동 지도 조합 제안" className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">공동 지도 조합 제안 (근거 인용 확인된 것만)</p>
          {combo?.status === "ok" ? (
            <p className="mt-0.5 text-sm leading-6 text-foreground">
              {combo.roles.map((r, i) => (
                <span key={r.authorId}>
                  {i > 0 && <span className="text-muted-foreground"> · </span>}
                  <span className="text-foreground/75">{r.role}</span> <b className="font-semibold">{nameOf(r.authorId) ?? r.name}</b>
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
              근거 부족 — {combo?.status === "insufficient" ? combo.reason : "조합을 만들지 못했습니다."}
            </p>
          )}
        </div>
        {combo?.status === "ok" && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            근거 {open ? "접기" : "보기"}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && combo?.status === "ok" && (
        <ul className="space-y-3 border-t border-border px-4 py-3">
          {combo.roles.map((r) => (
            <li key={r.authorId} className="text-sm leading-6">
              <b className="font-semibold">{nameOf(r.authorId) ?? r.name}</b> <span className="text-foreground/75">— {r.role}</span>
              <Cite p={r.evidence} />
            </li>
          ))}
          <li className="text-[11px] leading-5 text-muted-foreground">
            제안일 뿐입니다. 두 연구실이 함께 지도할 수 있는지는 직접 문의해야 합니다. 후보별 맞는 점·빈틈은 이름을 눌러 상세에서 볼 수 있습니다.
            {combo.note ? ` ${combo.note}` : ""}
          </li>
        </ul>
      )}
    </section>
  );
}

/* ───────── 제안서의 연락 예정 교수 (결과 위에 고정) ───────── */

export function AdvisorCard({
  advisor,
  result,
  lookup,
  onOpenRanked,
  onOpenDomestic,
  onOpenPinned,
}: {
  advisor: PlannedAdvisor;
  result: SearchResult;
  lookup: Async<AdvisorData>;
  onOpenRanked: (index: number) => void;
  onOpenDomestic: (index: number) => void;
  onOpenPinned: (c: Candidate, headline: string) => void;
}) {
  const { main, dom } = advisorIndex(advisor, result);
  const head = (
    <AlertTitle className="flex items-center gap-1.5 font-normal text-muted-foreground">
      <Pin className="size-3.5" aria-hidden="true" />
      제안서의 연락 예정 교수
    </AlertTitle>
  );
  const who = (
    <b className="font-semibold">
      {advisor.name}
      {advisor.name_en && <span className="ml-1 font-normal text-foreground/70">{advisor.name_en}</span>}
    </b>
  );

  if (main >= 0) {
    const c = result.candidates[main];
    const grp = c.group ?? "main";
    return (
      <Alert className="mt-5 border-ok/25 bg-ok-soft/60">
        <CircleCheck className="text-ok" aria-hidden="true" />
        {head}
        <AlertDescription className="text-foreground">
          <p>
            {who} ({advisor.affiliation}) — 결과에 있습니다 (
            {grp === "affiliation" ? "소속 확인 필요 묶음" : `전체 ${main + 1}위${main >= TOP ? ", 상위 5명 밖" : ""}`}).{" "}
            <button type="button" onClick={() => onOpenRanked(main)} className="font-medium text-primary underline underline-offset-[3px]">
              근거 보기
            </button>
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section aria-label="제안서의 연락 예정 교수" className="mt-5 rounded-xl border border-primary/25 bg-card">
      <div className="flex flex-wrap items-start gap-3 px-4 pt-3.5 pb-3">
        <Pin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">제안서의 연락 예정 교수 · 검색 상위 15명에는 없어 따로 찾아 같은 방식으로 계산 (순위에는 넣지 않음)</p>
          <p className="mt-0.5 text-sm text-foreground">
            {who} <span className="text-muted-foreground">({advisor.affiliation})</span>
            {dom >= 0 && <span className="ml-1.5 text-xs text-muted-foreground">국내 학술지 후보 {dom + 1}위에도 있음</span>}
          </p>
          <AdvisorBody lookup={lookup} onOpenPinned={onOpenPinned} onOpenDomestic={dom >= 0 ? () => onOpenDomestic(dom) : undefined} />
        </div>
      </div>
    </section>
  );
}

function AdvisorBody({
  lookup,
  onOpenPinned,
  onOpenDomestic,
}: {
  lookup: Async<AdvisorData>;
  onOpenPinned: (c: Candidate, headline: string) => void;
  onOpenDomestic?: () => void;
}) {
  if (lookup.state === "idle" || lookup.state === "loading")
    return <InlineLoading className="mt-2">상위 15명에 없어 OpenAlex에서 따로 찾아 같은 방식으로 점수·근거를 계산하는 중</InlineLoading>;
  if (lookup.state === "failed") return <p className="mt-2 text-xs text-muted-foreground">연락 예정 교수 조회에 실패했습니다. 상위 15명 안에는 없습니다.</p>;
  const a = lookup.data;
  const c = a.candidate;
  if (!c) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="flex items-center gap-1.5 text-sm text-foreground/85">
          <SearchX className="size-4 text-muted-foreground" aria-hidden="true" />
          상위 15명 안에 없고, OpenAlex에서도 확실히 맞는 기록을 찾지 못했습니다.
          {onOpenDomestic && (
            <button type="button" onClick={onOpenDomestic} className="font-medium text-primary underline underline-offset-[3px]">
              국내 학술지 후보 보기
            </button>
          )}
        </p>
        <Caveats list={a.caveats} />
      </div>
    );
  }
  const ev = c.items.filter((i) => i.evidence).length;
  const headline = `제안서의 연락 예정 교수${a.rankText ? ` · ${a.rankText}` : ""}`;
  return (
    <div className="mt-2.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm">
          <Scale className="size-4 text-muted-foreground" aria-hidden="true" />
          <b className="font-semibold text-foreground">{a.rankText ?? "순위 비교 정보 없음 (예전 저장 결과)"}</b>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          주제 <FitLevel label="주제" level={c.fit} score={c.T} />
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          방법 <FitLevel label="방법" level={c.methodFit} score={c.M} />
        </span>
        <span className="text-xs text-muted-foreground">
          초록 근거 <b className="font-semibold text-foreground tabular">{ev}</b>/{c.items.length}개
        </span>
        {a.status === "uncertain" && (
          <Flag tone="warn" title="이름은 맞지만 소속 기관이 제안서와 맞지 않습니다">
            같은 사람인지 불확실
          </Flag>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {c.name} · {c.institution} · 최근 {a.piOnly ? "책임저자 " : ""}논문 {a.papersScored}편으로 계산
      </p>
      <Caveats list={a.caveats} />
      <button
        type="button"
        onClick={() => onOpenPinned(c, headline)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:border-input hover:bg-muted"
      >
        근거·연락 보기
      </button>
    </div>
  );
}

function Caveats({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <ul className="space-y-1">
      {list.map((t) => (
        <li key={t} className="flex gap-1.5 text-xs leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

