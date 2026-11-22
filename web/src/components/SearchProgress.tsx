"use client";

import { Icon } from "./ui";
import { useElapsed } from "./useElapsed";

/**
 * /api/search는 진행 상황을 흘려보내지 않는다. 그래서 단계는 "보통 이쯤 걸린다"는 경과 시간 기준이고,
 * 화면에도 그렇게 적어 둔다 (실제 진행률인 척하지 않는다).
 */
const STAGES = [
  { at: 0, title: "검색어 정리", desc: "질문을 영어·한국어 검색어와 필요한 방법·장비 목록으로 나눕니다" },
  { at: 5, title: "논문 수집", desc: "OpenAlex·DBpia에서 최근 6년 한국 소속 논문을 모읍니다" },
  { at: 15, title: "적합도 계산", desc: "논문마다 주제·방법 유사도를 재고 책임저자별로 묶습니다" },
  { at: 28, title: "근거 찾기", desc: "초록에서 방법·장비가 실제로 적힌 문장을 찾습니다" },
];

export function SearchProgress({ question }: { question: string }) {
  const t = useElapsed();
  const current = STAGES.reduce((acc, s, i) => (t >= s.at ? i : acc), 0);
  const progress = Math.min(0.94, 1 - Math.exp(-t / 22));
  const slow = t > 60;

  return (
    <section aria-labelledby="progress-title" className="mt-10 animate-rise">
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="progress-title" className="font-serif text-lg font-bold text-ink">
            후보를 찾고 있어요
          </h2>
          <span className="font-mono text-sm tabular text-ink-3" aria-hidden="true">
            {Math.floor(t)}초
          </span>
        </div>
        {question && <p className="mt-1 line-clamp-2 text-sm text-ink-2">“{question}”</p>}

        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div
            className="absolute inset-y-0 left-0 origin-left rounded-full bg-primary transition-transform duration-500 ease-out"
            style={{ width: "100%", transform: `scaleX(${progress})` }}
          />
        </div>

        <ol className="mt-5 grid gap-3 sm:grid-cols-4" role="status" aria-live="polite">
          {STAGES.map((s, i) => {
            const state = i < current ? "done" : i === current ? "now" : "next";
            return (
              <li key={s.title} className="flex gap-3 sm:flex-col sm:gap-2" aria-current={state === "now" ? "step" : undefined}>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    state === "done"
                      ? "bg-primary text-white"
                      : state === "now"
                        ? "bg-primary-soft text-primary ring-2 ring-primary"
                        : "bg-sunken text-ink-3"
                  }`}
                >
                  {state === "done" ? <Icon name="check" className="size-3.5" /> : i + 1}
                  <span className="sr-only">{state === "done" ? "끝남" : state === "now" ? "진행 중" : "대기"}</span>
                </span>
                <span>
                  <span className={`block text-sm font-semibold ${state === "next" ? "text-ink-3" : "text-ink"}`}>
                    {s.title}
                    {state === "now" && <span className="ml-1 animate-blink">…</span>}
                  </span>
                  <span className={`block text-xs leading-5 ${state === "next" ? "text-ink-3/80" : "text-ink-2"}`}>{s.desc}</span>
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-5 text-xs leading-5 text-ink-3">
          {slow
            ? "평소보다 오래 걸리고 있어요. 논문이 많은 주제는 1분 넘게 걸릴 수 있습니다."
            : "보통 10초~1분 걸립니다. 서버가 진행 상황을 따로 알려주지 않아, 단계는 보통 걸리는 시간을 기준으로 보여줍니다."}
        </p>
      </div>

      <div className="mt-6 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} delay={i * 120} />
        ))}
      </div>
    </section>
  );
}

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-4">
        <div className="skeleton size-9" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-5 w-1/3" />
          <div className="skeleton h-3.5 w-1/2" />
        </div>
        <div className="hidden w-40 space-y-2 sm:block">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-full" />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_repeat(3,3rem)] gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton h-4" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-3 w-11/12" />
        <div className="skeleton h-3 w-3/4" />
      </div>
    </div>
  );
}
