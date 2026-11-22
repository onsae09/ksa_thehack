"use client";

import { useState } from "react";
import type { Extracted } from "@/app/api/extract/route";
import type { EmailResult } from "@/app/api/email/route";
import { METHOD_OPTIONS, type Candidate, type DomesticCandidate, type ItemResult, type SearchInput, type SearchResult } from "@/lib/types";

const EXAMPLES: (SearchInput & { title: string })[] = [
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

const TYPE_LABEL: Record<string, string> = {
  education: "대학",
  facility: "연구소",
  government: "국공립 연구기관",
  nonprofit: "비영리 연구기관",
  healthcare: "병원",
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [equipment, setEquipment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const [nameFilter, setNameFilter] = useState<"all" | "korean" | "other">("all");
  const [orgFilter, setOrgFilter] = useState<"all" | "university" | "institute">("all");
  const [extracting, setExtracting] = useState(false);
  const [proposal, setProposal] = useState<Extracted | null>(null);

  async function uploadProposal(file: File) {
    setExtracting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "제안서 분석에 실패했습니다.");
      const ex = data as Extracted;
      setProposal(ex);
      setQuestion(ex.question);
      setMethods(ex.methods);
      setEquipment(ex.equipment.join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "제안서 분석에 실패했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  async function run(input: SearchInput) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "오류가 발생했습니다.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function pickExample(ex: (typeof EXAMPLES)[number]) {
    setQuestion(ex.question);
    setMethods(ex.methods);
    setEquipment(ex.equipment);
    run(ex);
  }

  const filtered =
    result?.candidates.filter(
      (c) =>
        (!onlyEvidence || c.items.some((i) => i.evidence)) &&
        (nameFilter === "all" || (nameFilter === "korean") === c.koreanName) &&
        (orgFilter === "all" || orgFilter === c.orgKind),
    ) ?? [];
  const shown = filtered.slice(0, 5);
  const more = filtered.slice(5);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">LabFit KR</h1>
        <p className="mt-2 text-stone-600">
          연구 주제와 방법을 넣으면, 그 주제를 그 방법으로 연구해본 근거가 있는 한국 연구자를 논문 링크와 함께 보여줍니다.
        </p>
      </header>

      <form
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run({ question, methods, equipment });
        }}
      >
        <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-4">
          <label className="block text-sm">
            <span className="font-semibold">연구제안서 PDF로 시작하기</span>
            <span className="ml-2 text-xs text-stone-500">올리면 아래 칸이 자동으로 채워집니다. 파일은 저장하지 않습니다.</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={extracting || loading}
              className="mt-2 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadProposal(f);
              }}
            />
          </label>
          {extracting && <p className="mt-2 text-sm text-stone-600">제안서를 읽는 중… (10초 안팎)</p>}
          {proposal && !extracting && (
            <p className="mt-2 text-sm text-emerald-800">
              「{proposal.title}」에서 추출했습니다. 아래 내용이 맞는지 확인·수정한 뒤 후보 찾기를 누르세요.
            </p>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-semibold">연구 질문 *</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-stone-300 p-3 text-sm"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="예: 탁구공의 회전이 반발 궤적에 주는 영향을 모델링할 수 있는가"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-semibold">쓰려는 방법 * (복수 선택)</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {METHOD_OPTIONS.map((m) => {
              const on = methods.includes(m);
              return (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMethods(on ? methods.filter((x) => x !== m) : [...methods, m])}
                  className={`rounded-full border px-3 py-1 text-sm ${on ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-sm font-semibold">필요한 장비·도구·데이터 (선택, 쉼표로 구분)</span>
          <input
            className="mt-1 w-full rounded-lg border border-stone-300 p-3 text-sm"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="비우면 주제에서 추정해 '추정'으로 표시합니다"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "찾는 중… (최대 1분)" : "후보 찾기"}
          </button>
          <span className="text-xs text-stone-500">예시:</span>
          {EXAMPLES.map((ex) => (
            <button
              type="button"
              key={ex.title}
              disabled={loading}
              onClick={() => pickExample(ex)}
              className="rounded-full border border-stone-300 px-3 py-1 text-xs hover:bg-stone-100"
            >
              {ex.title}
            </button>
          ))}
        </div>
      </form>

      {error && <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {result && (
        <section className="mt-8">
          <p className="mb-3 text-sm text-stone-600">
            한국 소속 논문 {result.stats.papers}편 · 책임저자 {result.stats.authors}명 중 상위 {result.candidates.length}명을 점수화 ·{" "}
            {(result.stats.ms / 1000).toFixed(1)}초
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-white p-3 text-sm ring-1 ring-stone-200">
            <Segmented
              label="소속"
              value={orgFilter}
              onChange={setOrgFilter}
              options={[["all", "전체"], ["university", "대학교"], ["institute", "연구소"]]}
            />
            <Segmented
              label="이름"
              value={nameFilter}
              onChange={setNameFilter}
              options={[["all", "전체"], ["korean", "한국인"], ["other", "외국인"]]}
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={onlyEvidence} onChange={(e) => setOnlyEvidence(e.target.checked)} />
              방법·장비 근거 있는 후보만
            </label>
            <span className="w-full text-xs text-stone-400">
              한국인/외국인은 국적 정보가 없어 이름 표기로 추정한 값입니다. 연구소에는 출연연·국공립 연구기관·병원이 포함됩니다.
            </span>
          </div>
          {result.candidates.length > 0 && filtered.length === 0 && (
            <p className="rounded-lg bg-stone-100 p-4 text-sm">필터 조건에 맞는 후보가 없습니다. 필터를 풀어 보세요.</p>
          )}
          {result.candidates.length === 0 && (
            <p className="rounded-lg bg-stone-100 p-4 text-sm">
              조건에 맞는 한국 소속 논문을 찾지 못했습니다. 질문을 더 일반적인 표현으로 바꿔 보세요.
            </p>
          )}
          <div className="space-y-4">
            {shown.map((c, i) => (
              <CandidateCard key={c.authorId} c={c} rank={i + 1} />
            ))}
          </div>
          {more.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-stone-600">후보 {more.length}명 더 보기</summary>
              <div className="mt-4 space-y-4">
                {more.map((c, i) => (
                  <CandidateCard key={c.authorId} c={c} rank={i + 6} />
                ))}
              </div>
            </details>
          )}

          {proposal?.planned_advisor && <AdvisorCheck advisor={proposal.planned_advisor} result={result} />}

          <DomesticSection domestic={result.domestic} nameFilter={nameFilter} />

          <p className="mt-6 text-xs text-stone-500">
            검색 기준: OpenAlex에 등록된 최근 6년 논문 초록. 검색어: {result.normalized.search_queries.join(" / ")}
          </p>
        </section>
      )}
    </main>
  );
}

function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">
          {rank}. {c.name}
        </h2>
        <FitBadges c={c} />
      </div>
      <p className="text-sm text-stone-600">
        {c.institution} · {TYPE_LABEL[c.institutionType] ?? c.institutionType}
        {!c.koreanName && <span className="ml-1 text-xs text-stone-400">· 외국인 추정</span>}
      </p>
      <div className="mt-1 flex flex-wrap gap-3 text-xs">
        <a className="underline" href={c.links.search} target="_blank" rel="noreferrer">연구실 검색</a>
        <a className="underline" href={c.links.openalex} target="_blank" rel="noreferrer">논문 목록(OpenAlex)</a>
        {c.links.orcid && <a className="underline" href={c.links.orcid} target="_blank" rel="noreferrer">ORCID</a>}
      </div>
      <EmailFinder name={c.name} institution={c.institution} hint={c.topPapers[0]?.title ?? ""} />

      <h3 className="mt-4 text-sm font-semibold">수행 가능성 (초록 기준)</h3>
      <EvidenceList items={c.items} />
      {c.warning && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">⚠ {c.warning}</p>}

      <h3 className="mt-4 text-sm font-semibold">가까운 논문</h3>
      <ul className="mt-1 space-y-1 text-sm">
        {c.topPapers.map((p) => (
          <li key={p.id}>
            <a className="underline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>{" "}
            <span className="text-xs text-stone-500">({p.year}, 주제 {p.similarity.toFixed(2)} · 방법 {p.methodSimilarity.toFixed(2)})</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
        연구실이 고등학생을 받는지는 논문 데이터로 알 수 없으므로 직접 문의가 필요합니다.
      </p>
    </article>
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-200 px-0.5">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

function EvidenceList({ items }: { items: ItemResult[] }) {
  return (
    <ul className="mt-1 space-y-2">
        {items.map((it) => (
          <li key={it.label} className="text-sm">
            <span className={it.evidence ? "text-emerald-700" : "text-stone-500"}>
              {it.evidence ? "✓ 논문에서 확인됨" : "– 근거 없음"}
            </span>{" "}
            <b>{it.label}</b>
            {it.inferred && <span className="ml-1 rounded bg-stone-100 px-1 text-xs text-stone-500">추정</span>}
            {it.evidence && (
              <blockquote className="mt-1 border-l-2 border-stone-300 pl-3 text-xs text-stone-600">
                “<Highlight text={it.evidence.sentence} term={it.evidence.matched} />”{" "}
                <a className="underline" href={it.evidence.url} target="_blank" rel="noreferrer">
                  {it.evidence.onTopic ? "원문 (이 주제 논문)" : "원문 (같은 연구자의 다른 주제 논문)"}
                </a>
              </blockquote>
            )}
          </li>
        ))}
      </ul>
  );
}

function DomesticSection({ domestic, nameFilter }: { domestic: SearchResult["domestic"]; nameFilter: "all" | "korean" | "other" }) {
  const list = domestic.candidates.filter((c) => nameFilter === "all" || (nameFilter === "korean") === c.koreanName);
  if (domestic.status === "failed") {
    return <p className="mt-8 text-xs text-stone-500">국내 학술지(DBpia) 검색에 실패해 이번 결과에서는 생략했습니다.</p>;
  }
  if (list.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold">국내 학술지 후보 (DBpia)</h2>
      <p className="mt-1 text-xs text-stone-500">
        국내 학회·학술지 논문의 마지막 저자 기준입니다. DBpia는 소속과 교신저자를 공개하지 않아 위 목록과 합치지 않고 따로 보여줍니다.
      </p>
      <div className="mt-4 space-y-4">
        {list.map((c) => (
          <DomesticCard key={c.ancId} c={c} />
        ))}
      </div>
    </section>
  );
}

function DomesticCard({ c }: { c: DomesticCandidate }) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">
          {c.name}
          {c.nameEn && c.nameEn !== c.name && <span className="ml-1 font-normal text-stone-500">({c.nameEn})</span>}
        </h3>
        <FitBadges c={c} />
      </div>
      <p className="text-sm text-stone-600">
        {c.fields.length ? c.fields.join(" · ") : "연구분야 정보 없음"}
        {c.paperCount && ` · DBpia 논문 ${c.paperCount}편`}
      </p>
      <div className="mt-1 flex flex-wrap gap-3 text-xs">
        <a className="underline" href={c.links.dbpia} target="_blank" rel="noreferrer">DBpia 저자 페이지</a>
        <a className="underline" href={c.links.search} target="_blank" rel="noreferrer">연구실 검색</a>
      </div>
      <EmailFinder
        name={c.nameEn ? `${c.name} (${c.nameEn})` : c.name}
        institution=""
        hint={[c.fields[0], c.topPapers[0]?.title].filter(Boolean).join(" / ")}
      />
      <h4 className="mt-4 text-sm font-semibold">수행 가능성 (초록 기준)</h4>
      <EvidenceList items={c.items} />
      {c.warning && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">⚠ {c.warning}</p>}
      <h4 className="mt-4 text-sm font-semibold">가까운 논문</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {c.topPapers.map((p) => (
          <li key={p.id}>
            <a className="underline" href={p.url} target="_blank" rel="noreferrer">{p.title}</a>{" "}
            <span className="text-xs text-stone-500">({p.journal}, {p.year}, 주제 {p.similarity.toFixed(2)} · 방법 {p.methodSimilarity.toFixed(2)})</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
        연구실이 고등학생을 받는지는 논문 데이터로 알 수 없으므로 직접 문의가 필요합니다.
      </p>
    </article>
  );
}

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z가-힣]/g, "");
}

/** 제안서에 적힌 연락 예정 교수가 결과에 있는지 (이름 표기 차이를 고려해 성·이름 순서 둘 다 비교) */
function AdvisorCheck({ advisor, result }: { advisor: NonNullable<Extracted["planned_advisor"]>; result: SearchResult }) {
  const en = advisor.name_en.trim().split(/\s+/);
  const variants = new Set([normName(advisor.name), normName(en.join("")), normName([...en.slice(-1), ...en.slice(0, -1)].join(""))]);
  const main = result.candidates.findIndex((c) => variants.has(normName(c.name)));
  const dom = result.domestic.candidates.findIndex((c) => variants.has(normName(c.name)) || (c.nameEn && variants.has(normName(c.nameEn))));
  const found =
    main >= 0 ? `전체 ${main + 1}위${main >= 5 ? ", 상위 5명 밖" : ""}` : dom >= 0 ? `국내 학술지 후보 ${dom + 1}위` : null;
  return (
    <p className={`mt-6 rounded-lg p-4 text-sm ${found ? "bg-emerald-50 text-emerald-900" : "bg-stone-100 text-stone-700"}`}>
      제안서의 연락 예정 교수 <b>{advisor.name}</b> ({advisor.affiliation}):{" "}
      {found ? `결과에 있습니다 (${found}).` : "상위 15명 안에는 없습니다. 논문 데이터로는 잡히지 않는 연결(학교 협력, 지인 소개 등)로 고른 교수일 수 있습니다."}
    </p>
  );
}

const FIT_COLOR: Record<string, string> = {
  높음: "bg-emerald-100 text-emerald-800",
  중간: "bg-amber-100 text-amber-800",
  낮음: "bg-stone-200 text-stone-700",
};

function FitBadges({ c }: { c: { fit: string; T: number; methodFit: string; M: number } }) {
  return (
    <span className="flex flex-wrap gap-1">
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FIT_COLOR[c.fit]}`}>
        주제 {c.fit} ({c.T.toFixed(2)})
      </span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FIT_COLOR[c.methodFit]}`}>
        방법 {c.methodFit} ({c.M.toFixed(2)})
      </span>
    </span>
  );
}

function EmailFinder({ name, institution, hint }: { name: string; institution: string; hint: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [r, setR] = useState<EmailResult | null>(null);

  async function find() {
    setState("loading");
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, institution, hint }),
      });
      if (!res.ok) throw new Error();
      setR(await res.json());
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-2 text-sm">
      {state === "idle" && (
        <button type="button" onClick={find} className="rounded-md border border-stone-300 px-2 py-0.5 text-xs hover:bg-stone-100">
          ✉ 이메일 찾기
        </button>
      )}
      {state === "loading" && <span className="text-xs text-stone-500">공개 웹페이지에서 찾는 중… (10~20초)</span>}
      {state === "error" && <span className="text-xs text-red-600">이메일 검색에 실패했습니다.</span>}
      {state === "done" && r && !r.email && <span className="text-xs text-stone-500">공개 페이지에서 이메일을 찾지 못했습니다.</span>}
      {state === "done" && r?.email && (
        <span className="flex flex-wrap items-center gap-2">
          <a className="font-mono text-sm underline" href={`mailto:${r.email}`}>{r.email}</a>
          {r.verified ? (
            <span className="rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">✓ 출처 페이지에서 확인됨</span>
          ) : (
            <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">⚠ 자동 확인 실패 · 출처에서 직접 확인 필요</span>
          )}
          {r.source && (
            <a className="text-xs underline text-stone-500" href={r.source} target="_blank" rel="noreferrer">출처</a>
          )}
        </span>
      )}
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
    <span className="flex items-center gap-2">
      <span className="text-stone-500">{label}</span>
      <span className="inline-flex overflow-hidden rounded-md ring-1 ring-stone-300">
        {options.map(([v, text]) => (
          <button
            type="button"
            key={v}
            onClick={() => onChange(v)}
            className={`px-2.5 py-1 text-xs ${value === v ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
          >
            {text}
          </button>
        ))}
      </span>
    </span>
  );
}
