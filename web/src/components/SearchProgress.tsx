"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useElapsed } from "./useElapsed";
import type { SearchProgressEvent, SearchStage } from "@/lib/types";

/**
 * /api/search가 단계마다 보내는 진행 이벤트(stream: true)를 그대로 보여준다.
 * 끝난 단계에는 서버가 보낸 실제 수치(논문 몇 편, 후보 몇 명 등)를 적는다.
 */
const STAGES: { key: SearchStage; title: string; desc: string }[] = [
  { key: "normalize", title: "검색어 정리", desc: "질문을 검색어와 필요한 방법·장비 목록으로 나눕니다" },
  { key: "collect", title: "논문 수집", desc: "OpenAlex·DBpia에서 최근 6년 한국 소속 논문을 모읍니다" },
  { key: "score", title: "적합도 계산", desc: "논문마다 주제·방법 유사도를 재고 책임저자별로 묶습니다" },
  { key: "evidence", title: "근거 찾기", desc: "초록에서 방법·장비가 실제로 적힌 문장을 찾습니다" },
];

export function SearchProgress({ events }: { events: SearchProgressEvent[] }) {
  const t = useElapsed();
  const doneOf = (k: string) => events.find((e) => e.stage === k && e.status === "done");
  const started = (k: string) => events.some((e) => e.stage === k);
  const states = STAGES.map((s, i) =>
    doneOf(s.key) ? "done" : started(s.key) || (i === 0 && events.length === 0) ? "now" : "next",
  );
  const doneCount = states.filter((x) => x === "done").length;
  // 끝난 단계 수 기준 + 진행 중인 단계는 절반만 (실제 단계 진행에 맞춰 움직인다)
  const progress = Math.min(98, ((doneCount + (states.includes("now") ? 0.5 : 0)) / STAGES.length) * 100);
  const domestic = doneOf("domestic");
  const slow = t > 60;

  return (
    <section aria-labelledby="progress-title" className="animate-rise">
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="progress-title" className="font-serif text-lg font-semibold text-foreground">
            후보를 찾고 있어요
          </h2>
          <span className="text-sm text-muted-foreground tabular" aria-hidden="true">
            {Math.floor(t)}초
          </span>
        </div>
        <Progress value={progress} className="mt-3 h-1" aria-label={`${STAGES.length}단계 중 ${doneCount}단계 끝남`} />
        <ol className="mt-4 grid gap-3 sm:grid-cols-4 sm:gap-4" role="status" aria-live="polite">
          {STAGES.map((s, i) => {
            const state = states[i];
            const detail = doneOf(s.key)?.detail;
            return (
              <li key={s.key} className="flex gap-2.5" aria-current={state === "now" ? "step" : undefined}>
                <span
                  className={cn(
                    "mt-px grid size-5 shrink-0 place-items-center rounded-full",
                    state === "done" && "bg-primary text-primary-foreground",
                    state === "now" && "text-primary ring-1 ring-primary",
                    state === "next" && "text-muted-foreground ring-1 ring-border",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                  ) : state === "now" ? (
                    <Loader2 className="size-3 animate-spin" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <span className="text-xs font-semibold tabular">{i + 1}</span>
                  )}
                  <span className="sr-only">{state === "done" ? "끝남" : state === "now" ? "진행 중" : "대기"}</span>
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", state === "next" ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
                  <span className={cn("block text-xs leading-5", detail ? "text-foreground/80 tabular" : "text-muted-foreground")}>
                    {detail ?? s.desc}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          <span>
            {slow ? "평소보다 오래 걸리고 있어요. 논문이 많은 주제는 1분 넘게 걸릴 수 있습니다" : "보통 10초~1분 걸립니다"}
          </span>
          {domestic?.detail && (
            <span className="inline-flex items-center gap-1 text-foreground/80">
              <Check className="size-3" aria-hidden="true" />
              {domestic.detail}
            </span>
          )}
        </p>
      </div>

      <SkeletonTable />
    </section>
  );
}

function SkeletonTable() {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card" aria-hidden="true">
      <div className="flex gap-4 border-b border-border bg-muted/60 px-4 py-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="ml-auto h-3 w-16" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="hidden h-3 w-20 sm:block" />
        <Skeleton className="hidden h-3 w-20 sm:block" />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-0" style={{ opacity: 1 - i * 0.15 }}>
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="hidden h-5 w-20 sm:block" />
          <Skeleton className="hidden h-5 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
