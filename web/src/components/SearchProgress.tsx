"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useElapsed } from "./useElapsed";

/**
 * /api/search는 진행 상황을 흘려보내지 않는다. 단계는 "보통 이쯤 걸린다"는 경과 시간 기준이고,
 * 화면에도 그렇게 적는다 (실제 진행률인 척하지 않는다).
 */
const STAGES = [
  { at: 0, title: "검색어 정리", desc: "질문을 검색어와 필요한 방법·장비 목록으로 나눕니다" },
  { at: 5, title: "논문 수집", desc: "OpenAlex·DBpia에서 최근 6년 한국 소속 논문을 모읍니다" },
  { at: 15, title: "적합도 계산", desc: "논문마다 주제·방법 유사도를 재고 책임저자별로 묶습니다" },
  { at: 28, title: "근거 찾기", desc: "초록에서 방법·장비가 실제로 적힌 문장을 찾습니다" },
];

export function SearchProgress() {
  const t = useElapsed();
  const current = STAGES.reduce((acc, s, i) => (t >= s.at ? i : acc), 0);
  const progress = Math.min(94, (1 - Math.exp(-t / 22)) * 100);
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
        <Progress value={progress} className="mt-3 h-1" aria-label="경과 시간 기준 진행 표시" />
        <ol className="mt-4 grid gap-3 sm:grid-cols-4 sm:gap-4" role="status" aria-live="polite">
          {STAGES.map((s, i) => {
            const state = i < current ? "done" : i === current ? "now" : "next";
            return (
              <li key={s.title} className="flex gap-2.5" aria-current={state === "now" ? "step" : undefined}>
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
                    <span className="text-[10px] font-semibold tabular">{i + 1}</span>
                  )}
                  <span className="sr-only">{state === "done" ? "끝남" : state === "now" ? "진행 중" : "대기"}</span>
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", state === "next" ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
                  <span className="block text-xs leading-5 text-muted-foreground">{s.desc}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          {slow
            ? "평소보다 오래 걸리고 있어요. 논문이 많은 주제는 1분 넘게 걸릴 수 있습니다."
            : "보통 10초~1분 걸립니다. 서버가 진행 상황을 따로 알려주지 않아, 단계는 보통 걸리는 시간을 기준으로 보여줍니다."}
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
