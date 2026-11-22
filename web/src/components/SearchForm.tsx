"use client";

import { useState } from "react";
import type { Extracted } from "@/app/api/extract/route";
import { METHOD_OPTIONS, type SearchInput } from "@/lib/types";
import { Icon } from "./ui";
import { useElapsed } from "./useElapsed";

export const EXAMPLES: (SearchInput & { title: string })[] = [
  {
    title: "탁구공 회전과 반발 궤적",
    question: "탁구공의 회전이 반발 궤적에 주는 영향을 모델링할 수 있는가",
    methods: ["시뮬레이션", "실험"],
    equipment: "고속카메라",
  },
  {
    title: "미세플라스틱과 플랑크톤",
    question: "미세플라스틱 농도가 담수 동물플랑크톤의 성장과 생존에 미치는 영향",
    methods: ["실험", "데이터 분석"],
    equipment: "",
  },
  {
    title: "지하철 혼잡도 예측",
    question: "그래프 신경망으로 지하철 역별 혼잡도를 예측할 수 있는가",
    methods: ["데이터 분석", "시뮬레이션"],
    equipment: "교통카드 승하차 데이터",
  },
];

type Props = {
  question: string;
  methods: string[];
  equipment: string;
  setQuestion: (v: string) => void;
  setMethods: (v: string[]) => void;
  setEquipment: (v: string) => void;
  loading: boolean;
  extracting: boolean;
  proposal: Extracted | null;
  fileName: string | null;
  onUpload: (f: File) => void;
  onSubmit: () => void;
  onExample: (ex: (typeof EXAMPLES)[number]) => void;
};

export function SearchForm(p: Props) {
  const [touched, setTouched] = useState(false);
  const busy = p.loading || p.extracting;
  const missingQuestion = p.question.trim().length === 0;
  const missingMethods = p.methods.length === 0;

  return (
    <form
      className="rounded-xl border border-line bg-surface shadow-[0_1px_0_rgba(27,35,48,0.04)]"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (missingQuestion || missingMethods) return;
        p.onSubmit();
      }}
      noValidate
    >
      <ProposalDrop {...p} busy={busy} />

      <div className="space-y-6 p-5 sm:p-6">
        <div>
          <label htmlFor="q" className="flex items-baseline gap-2 text-sm font-semibold text-ink">
            연구 질문 <span className="text-xs font-normal text-danger">필수</span>
          </label>
          <textarea
            id="q"
            className="mt-2 w-full resize-y rounded-lg border border-line-strong bg-surface p-3 text-base leading-7 text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-[15px]"
            rows={2}
            value={p.question}
            onChange={(e) => p.setQuestion(e.target.value)}
            placeholder="예: 탁구공의 회전이 반발 궤적에 주는 영향을 모델링할 수 있는가"
            aria-invalid={touched && missingQuestion}
            aria-describedby={touched && missingQuestion ? "q-err" : "q-help"}
          />
          {touched && missingQuestion ? (
            <p id="q-err" role="alert" className="mt-1 text-xs text-danger">
              연구 질문을 한 문장으로 적어 주세요.
            </p>
          ) : (
            <p id="q-help" className="mt-1 text-xs text-ink-3">
              무엇을 알아내고 싶은지 한 문장으로. 한국어 그대로 써도 됩니다.
            </p>
          )}
        </div>

        <fieldset aria-describedby={touched && missingMethods ? "m-err" : undefined}>
          <legend className="flex items-baseline gap-2 text-sm font-semibold text-ink">
            쓰려는 방법 <span className="text-xs font-normal text-danger">필수</span>
            <span className="text-xs font-normal text-ink-3">여러 개 고를 수 있어요</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {METHOD_OPTIONS.map((m) => {
              const on = p.methods.includes(m);
              return (
                <button
                  type="button"
                  key={m}
                  aria-pressed={on}
                  onClick={() => p.setMethods(on ? p.methods.filter((x) => x !== m) : [...p.methods, m])}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium transition-colors ${
                    on
                      ? "border-primary bg-primary text-white"
                      : "border-line-strong bg-surface text-ink-2 hover:border-ink-3 hover:text-ink"
                  }`}
                >
                  {on && <Icon name="check" className="size-3.5" />}
                  {m}
                </button>
              );
            })}
          </div>
          {touched && missingMethods && (
            <p id="m-err" role="alert" className="mt-1 text-xs text-danger">
              방법을 하나 이상 골라 주세요.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="eq" className="flex items-baseline gap-2 text-sm font-semibold text-ink">
            필요한 장비·도구·데이터 <span className="text-xs font-normal text-ink-3">선택 · 쉼표로 구분</span>
          </label>
          <input
            id="eq"
            className="mt-2 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-[15px]"
            value={p.equipment}
            onChange={(e) => p.setEquipment(e.target.value)}
            placeholder="예: 고속카메라, 원자힘현미경"
            aria-describedby="eq-help"
          />
          <p id="eq-help" className="mt-1 text-xs text-ink-3">
            비워 두면 주제에서 추정하고, 결과에 <span className="font-medium text-warn">추정</span>으로 표시합니다.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-line bg-sunken/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="search" className="size-4" />
          {p.loading ? "찾는 중…" : "지도교수 후보 찾기"}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">예시로 해보기</span>
          {EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex.title}
              disabled={busy}
              onClick={() => p.onExample(ex)}
              className="min-h-9 rounded-md border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {ex.title}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

function ProposalDrop(p: Props & { busy: boolean }) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="border-b border-line p-5 sm:p-6">
      <label
        htmlFor="pdf"
        onDragOver={(e) => {
          e.preventDefault();
          if (!p.busy) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !p.busy) p.onUpload(f);
        }}
        className={`flex cursor-pointer items-center gap-4 rounded-lg border border-dashed px-4 py-4 transition-colors ${
          drag ? "border-primary bg-primary-soft" : "border-line-strong bg-paper hover:border-ink-3"
        } ${p.busy ? "pointer-events-none opacity-70" : ""}`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface text-primary ring-1 ring-line">
          <Icon name={p.proposal ? "file" : "upload"} className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">연구제안서 PDF로 시작하기</span>
          <span className="block text-xs leading-5 text-ink-3">
            끌어다 놓거나 눌러서 고르세요. 아래 칸이 자동으로 채워지고, 파일은 저장하지 않습니다.
          </span>
        </span>
        <input
          id="pdf"
          type="file"
          accept="application/pdf,.pdf"
          disabled={p.busy}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onUpload(f);
            e.target.value = "";
          }}
        />
      </label>
      {p.extracting && <ExtractProgress fileName={p.fileName} />}
      {p.proposal && !p.extracting && (
        <p className="mt-3 flex gap-2 text-sm leading-6 text-ok" role="status">
          <Icon name="check" className="mt-1 size-4" />
          <span>
            「{p.proposal.title}」에서 옮겨 적었습니다. 아래 내용이 제안서와 같은지 확인·수정한 뒤 후보 찾기를 누르세요.
          </span>
        </p>
      )}
    </div>
  );
}

function ExtractProgress({ fileName }: { fileName: string | null }) {
  const t = useElapsed();
  return (
    <div role="status" aria-live="polite" className="mt-3">
      <div className="flex items-center justify-between text-xs text-ink-2">
        <span className="truncate">
          {fileName ? `${fileName} 읽는 중` : "제안서 읽는 중"} — 연구 주제·방법·장비를 원문 그대로 옮기고 있어요
        </span>
        <span className="ml-3 shrink-0 font-mono tabular text-ink-3">{Math.floor(t)}초 / 보통 10초</span>
      </div>
      <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-sunken">
        <span className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-primary" />
      </div>
    </div>
  );
}
