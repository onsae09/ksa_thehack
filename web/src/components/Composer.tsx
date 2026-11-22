"use client";

import { useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, Database, FileCheck2, FileUp, Loader2, Microscope, Pencil, Plus, RotateCcw } from "lucide-react";
import type { Extracted } from "@/app/api/extract/route";
import { METHOD_OPTIONS, type SearchInput } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
    equipment: "",
    data: "교통카드 승하차 데이터",
  },
];

export type ComposerProps = {
  question: string;
  methods: string[];
  equipment: string;
  data: string;
  setQuestion: (v: string) => void;
  setMethods: (v: string[]) => void;
  setEquipment: (v: string) => void;
  setData: (v: string) => void;
  loading: boolean;
  extracting: boolean;
  proposal: Extracted | null;
  fileName: string | null;
  onUpload: (f: File) => void;
  onSubmit: () => void;
};

/**
 * 히어로의 단 하나의 초점: 작성 카드.
 * 진한 머리 띠(제안서 PDF) → 연구 질문 → 장비 한 줄 → 꼬리 도구줄(방법 칩 + 둥근 제출 버튼).
 * 카드 전체에 PDF를 끌어다 놓을 수 있다.
 */
export function Composer(p: ComposerProps) {
  const [touched, setTouched] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = p.loading || p.extracting;
  const missingQuestion = p.question.trim().length === 0;
  const missingMethods = p.methods.length === 0;

  return (
    <form
      noValidate
      aria-label="지도교수 후보 찾기"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (missingQuestion || missingMethods) return;
        p.onSubmit();
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!busy) setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f && !busy) p.onUpload(f);
      }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-deep/90 bg-deep shadow-[0_18px_40px_-24px_rgba(16,42,44,0.45)] transition-shadow",
        drag && "ring-4 ring-primary/30",
      )}
    >
      {/* 머리 띠: 제안서 PDF */}
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-deep-foreground sm:px-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/8 px-3 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-60"
        >
          {p.extracting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : p.proposal ? (
            <FileCheck2 className="size-4" aria-hidden="true" />
          ) : (
            <FileUp className="size-4" aria-hidden="true" />
          )}
          {p.proposal ? "다른 제안서 올리기" : "연구제안서 PDF로 시작"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label="연구제안서 PDF 파일"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onUpload(f);
            e.target.value = "";
          }}
        />
        <ProposalStatus extracting={p.extracting} proposal={p.proposal} fileName={p.fileName} drag={drag} />
      </div>

      {/* 본문 */}
      <div className="rounded-t-xl bg-card">
        <label htmlFor="q" className="sr-only">
          연구 질문 (필수)
        </label>
        <textarea
          id="q"
          rows={3}
          value={p.question}
          onChange={(e) => p.setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
          placeholder="무엇을 알아내고 싶나요? 예: 탁구공의 회전이 반발 궤적에 주는 영향을 모델링할 수 있는가"
          aria-invalid={touched && missingQuestion}
          aria-describedby={touched && missingQuestion ? "q-err" : undefined}
          className="block min-h-28 w-full resize-none bg-transparent px-5 pt-5 pb-3 text-[17px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/80 sm:px-6 sm:text-lg"
        />
        {touched && missingQuestion && (
          <p id="q-err" role="alert" className="px-5 pb-2 text-xs text-destructive sm:px-6">
            연구 질문을 한 문장으로 적어 주세요.
          </p>
        )}

        <div className="flex items-start gap-2.5 border-t border-dashed border-border px-5 py-2.5 sm:px-6">
          <Microscope className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="eq" className="mt-2 w-14 shrink-0 text-sm font-medium text-foreground/80">
            장비
          </label>
          <textarea
            id="eq"
            rows={1}
            value={p.equipment}
            onChange={(e) => p.setEquipment(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="선택 · 실험 장비·측정 기법 (예: 고속카메라, 원자힘현미경)"
            aria-describedby="eq-help"
            className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/80"
          />
        </div>
        <p id="eq-help" className="sr-only">
          비워 두면 주제에서 추정하고, 결과에 추정으로 표시합니다. 보유 기관은 국가연구장비(ZEUS)에서 찾습니다.
        </p>

        <div className="flex items-start gap-2.5 border-t border-dashed border-border px-5 py-2.5 sm:px-6">
          <Database className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="dt" className="mt-2 w-14 shrink-0 text-sm font-medium text-foreground/80">
            데이터
          </label>
          <textarea
            id="dt"
            rows={1}
            value={p.data}
            onChange={(e) => p.setData(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="선택 · 데이터셋·DB (예: 교통카드 승하차 데이터, 기상청 관측자료)"
            aria-describedby="dt-help"
            className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/80"
          />
        </div>
        <p id="dt-help" className="sr-only">
          데이터는 공공데이터포털에서 받을 수 있는 데이터셋을 찾습니다. 비워 두고 데이터 분석을 고르면 주제에서 추정합니다.
        </p>
      </div>

      {/* 꼬리 도구줄: 방법 + 제출 */}
      <fieldset
        className="flex flex-wrap items-center gap-2 border-t border-border bg-muted px-3 py-3 sm:px-4"
        aria-describedby={touched && missingMethods ? "m-err" : "m-help"}
      >
        <legend className="sr-only">쓰려는 방법 (필수, 여러 개)</legend>
        <span id="m-help" className="mr-1 hidden text-xs font-medium text-muted-foreground sm:inline">
          방법
        </span>
        {METHOD_OPTIONS.map((m) => {
          const on = p.methods.includes(m);
          return (
            <button
              type="button"
              key={m}
              aria-pressed={on}
              onClick={() => p.setMethods(on ? p.methods.filter((x) => x !== m) : [...p.methods, m])}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                on
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-card text-foreground/75 hover:border-input hover:text-foreground",
              )}
            >
              {on ? <Check className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5 opacity-60" aria-hidden="true" />}
              {m}
            </button>
          );
        })}
        {touched && missingMethods && (
          <span id="m-err" role="alert" className="text-xs text-destructive">
            방법을 하나 이상 골라 주세요.
          </span>
        )}
        <button
          type="submit"
          disabled={busy}
          aria-label={p.loading ? "찾는 중" : "지도교수 후보 찾기"}
          className="ml-auto grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-4 focus-visible:ring-primary/25 focus-visible:outline-none disabled:opacity-50"
        >
          {p.loading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-5" aria-hidden="true" />}
        </button>
      </fieldset>
    </form>
  );
}

function ProposalStatus({
  extracting,
  proposal,
  fileName,
  drag,
}: {
  extracting: boolean;
  proposal: Extracted | null;
  fileName: string | null;
  drag: boolean;
}) {
  const t = useElapsed();
  if (drag) return <span className="text-sm text-white">여기에 놓으면 제안서를 읽습니다</span>;
  if (extracting) {
    return (
      <span role="status" aria-live="polite" className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm text-deep-foreground/90">
        <span className="truncate">{fileName ? `${fileName} 읽는 중` : "제안서 읽는 중"} · 주제·방법·장비를 원문 그대로 옮기는 중</span>
        <span className="shrink-0 text-xs text-deep-foreground/70 tabular">{Math.floor(t)}초 / 보통 10초</span>
      </span>
    );
  }
  if (proposal) {
    return (
      <span role="status" className="min-w-0 flex-1 text-sm leading-5 text-deep-foreground/90">
        {proposal.source === "aim"
          ? "제목 칸이 없는 양식이라 연구 목표 문장을 그대로 옮겼습니다. 제안서와 같은지 확인한 뒤 찾기를 누르세요."
          : `「${proposal.title}」에서 옮겨 적었습니다. 제안서와 같은지 확인한 뒤 찾기를 누르세요.`}
      </span>
    );
  }
  return <span className="hidden text-sm text-deep-foreground/70 sm:inline">끌어다 놓아도 됩니다 · 파일은 저장하지 않아요</span>;
}

/** 검색 뒤 접힌 작성 카드: 질문 한 줄 + 조건 + 결과 요약 + 수정 */
export function QueryBar({
  input,
  loading,
  meta,
  cachedAt,
  onEdit,
  onFresh,
}: {
  input: SearchInput;
  loading: boolean;
  meta: string | null;
  cachedAt?: string;
  onEdit: () => void;
  onFresh: () => void;
}) {
  const list = (s?: string) =>
    (s ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const equipment = list(input.equipment);
  const data = list(input.data);
  const cond = `${input.methods.join(" · ")}${equipment.length > 0 ? ` — 장비 ${equipment.join(", ")}` : " — 장비는 주제에서 추정"}${data.length > 0 ? ` — 데이터 ${data.join(", ")}` : ""}`;
  return (
    <div className="flex items-center gap-3">
      <span className="hidden size-9 shrink-0 place-items-center rounded-lg bg-deep text-deep-foreground sm:grid" aria-hidden="true">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4 rotate-45" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-foreground" title={input.question}>
          {input.question}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={cond}>
          {loading ? cond : meta ? <span className="tabular">{meta}</span> : cond}
          {cachedAt && !loading && <> · 저장된 결과 · {formatWhen(cachedAt)}</>}
        </p>
      </div>
      {cachedAt && !loading && (
        <Button type="button" variant="ghost" size="sm" onClick={onFresh} className="h-8 px-2" title="저장된 결과 대신 지금 다시 검색합니다">
          <RotateCcw aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">새로 검색</span>
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onEdit} className="h-8 shrink-0 px-2.5">
        <Pencil aria-hidden="true" />
        수정
      </Button>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
