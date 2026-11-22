"use client";

import { useEffect, useRef, useState } from "react";
import type { Extracted } from "@/app/api/extract/route";
import type { LabPagesResult, ProjectsResult, SearchInput, SearchResult } from "@/lib/types";
import { CandidateCard, DomesticCard } from "@/components/CandidateCard";
import { IDLE_SIDE, postJSON, type Async, type EquipData, type SideData } from "@/components/data";
import { EquipmentSection } from "@/components/Equipment";
import { Filters, type NameFilter, type OrgFilter } from "@/components/Filters";
import { OtherPIsSection } from "@/components/Projects";
import { AdvisorCheck, ResultsSummary } from "@/components/ResultsSummary";
import { EXAMPLES, SearchForm } from "@/components/SearchForm";
import { SearchProgress } from "@/components/SearchProgress";
import { Caveat, Icon, SectionHeading, SourceLabel } from "@/components/ui";

const TOP = 5;

export default function Home() {
  const [question, setQuestion] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [equipment, setEquipment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [lastInput, setLastInput] = useState<SearchInput | null>(null);
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const [nameFilter, setNameFilter] = useState<NameFilter>("all");
  const [orgFilter, setOrgFilter] = useState<OrgFilter>("all");
  const [extracting, setExtracting] = useState(false);
  const [proposal, setProposal] = useState<Extracted | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [side, setSide] = useState<SideData>(IDLE_SIDE);
  const runId = useRef(0);
  const lastQuestion = useRef("");
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading]);

  /** 후보가 나온 뒤 장비(ZEUS)·국가과제(NTIS)·연구실 페이지를 동시에 따로 불러온다. 하나가 실패해도 나머지는 그대로 */
  function loadSide(r: SearchResult, id: number) {
    const put = <K extends keyof SideData>(key: K, v: SideData[K]) => {
      if (runId.current === id) setSide((s) => ({ ...s, [key]: v }));
    };
    const cands = r.candidates.map((c) => ({ authorId: c.authorId, name: c.name, institutionId: c.institutionId }));
    const domesticNames = r.domestic.candidates.map((c) => c.name);

    const equipItems = r.normalized.items.filter((i) => i.kind === "equipment").map((i) => ({ label: i.label, inferred: i.inferred }));
    if (equipItems.length) {
      put("equip", { state: "loading" });
      const institutions = [...new Map(r.candidates.map((c) => [c.institutionId, { id: c.institutionId, name: c.institution }])).values()];
      postJSON<EquipData>("/api/equipment", { items: equipItems, institutions, names: domesticNames, candidates: cands })
        .then((d) => put("equip", d.status === "ok" ? { state: "ok", data: d } : { state: "failed" }))
        .catch(() => put("equip", { state: "failed" }));
    }

    const ntis = r.normalized.ntis_queries_ko as string[] | undefined; // 예전 캐시 결과에는 없을 수 있다
    const queries = ntis?.length ? ntis : [...r.normalized.search_queries_ko, ...r.normalized.method_search_queries_ko];
    put("projects", { state: "loading" });
    postJSON<ProjectsResult>("/api/projects", { question: lastQuestion.current, queries, candidates: cands, names: domesticNames })
      .then((d) => put("projects", d.status === "ok" ? { state: "ok", data: d } : { state: "failed" }))
      .catch(() => put("projects", { state: "failed" }));

    put("labs", { state: "loading" });
    postJSON<LabPagesResult>("/api/labpages", {
      candidates: r.candidates.slice(0, TOP).map((c) => ({ authorId: c.authorId, name: c.name, institution: c.institution, institutionId: c.institutionId })),
      items: r.normalized.items.map((i) => ({ label: i.label, keywords_ko: i.keywords_ko, keywords_en: i.keywords_en })),
    })
      .then((d) => put("labs", d.status === "failed" ? { state: "failed" } : ({ state: "ok", data: d } as Async<LabPagesResult>)))
      .catch(() => put("labs", { state: "failed" }));
  }

  async function uploadProposal(file: File) {
    setExtracting(true);
    setFileName(file.name);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
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
    const id = ++runId.current;
    lastQuestion.current = input.question;
    setLastInput(input);
    setLoading(true);
    setError(null);
    setResult(null);
    setSide(IDLE_SIDE);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "오류가 발생했습니다.");
      if (runId.current !== id) return;
      setResult(data);
      loadSide(data, id);
    } catch (e) {
      if (runId.current === id) setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      if (runId.current === id) setLoading(false);
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
  const shown = filtered.slice(0, TOP);
  const more = filtered.slice(TOP);
  const domestic = result?.domestic.candidates.filter((c) => nameFilter === "all" || (nameFilter === "korean") === c.koreanName) ?? [];
  const hasEquipItems = !!result?.normalized.items.some((i) => i.kind === "equipment");

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        본문으로 건너뛰기
      </a>
      <div className="border-b border-line bg-surface/60">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="font-serif text-lg font-bold tracking-tight text-ink">
            LabFit <span className="text-primary">KR</span>
          </span>
          <span className="text-xs text-ink-3">고등학생 R&amp;E 지도교수 찾기</span>
        </div>
      </div>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pt-10 pb-20 sm:px-6">
        <header className="mb-8 max-w-2xl">
          <h1 className="font-serif text-3xl leading-tight font-bold tracking-tight text-ink sm:text-[2.5rem]">
            그 주제를, 그 방법으로
            <br />
            연구해 본 교수님을 찾아요
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-ink-2">
            연구 질문과 쓰려는 방법을 넣으면 한국 연구자의 논문 초록에서 근거 문장을 찾아 지도교수 후보를 보여줍니다. 장비 보유 기관(ZEUS)과 국가과제(NTIS)도 함께 확인합니다.
          </p>
          <ul className="mt-5 grid gap-2 text-sm text-ink-2 sm:grid-cols-3">
            {[
              ["모든 근거에 출처 링크", "원문을 열어 직접 확인할 수 있어요"],
              ["추정은 추정이라고 표시", "이름·소속·장비 추정에 꼬리표"],
              ["없는 내용은 만들지 않음", "못 찾으면 못 찾았다고 씁니다"],
            ].map(([t, d]) => (
              <li key={t} className="border-l-2 border-primary/30 pl-3">
                <span className="block font-semibold text-ink">{t}</span>
                <span className="block text-xs text-ink-3">{d}</span>
              </li>
            ))}
          </ul>
        </header>

        <SearchForm
          question={question}
          methods={methods}
          equipment={equipment}
          setQuestion={setQuestion}
          setMethods={setMethods}
          setEquipment={setEquipment}
          loading={loading}
          extracting={extracting}
          proposal={proposal}
          fileName={fileName}
          onUpload={uploadProposal}
          onSubmit={() => run({ question, methods, equipment })}
          onExample={pickExample}
        />

        <div ref={resultsRef} className="scroll-mt-4">
          {error && (
            <div role="alert" className="mt-8 flex flex-wrap items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              <Icon name="alert" className="mt-0.5 size-4" />
              <p className="flex-1">{error}</p>
              {lastInput && !loading && (
                <button
                  type="button"
                  onClick={() => run(lastInput)}
                  className="min-h-9 rounded-md border border-danger/40 bg-surface px-3 text-xs font-semibold text-danger hover:bg-danger-soft"
                >
                  다시 시도
                </button>
              )}
            </div>
          )}

          {loading && <SearchProgress question={lastInput?.question ?? question} />}

          {result && (
            <div className="mt-12">
              <ResultsSummary result={result} top={shown} side={side} />

              {proposal?.planned_advisor && <AdvisorCheck advisor={proposal.planned_advisor} result={result} />}

              <nav aria-label="결과 바로가기" className="mt-8 flex flex-wrap gap-2 text-xs">
                {[
                  ["#candidates", "지도교수 후보"],
                  ["#ntis-others", "놓친 과제 책임자"],
                  ...(hasEquipItems ? [["#zeus", "장비 보유 기관"]] : []),
                  ...(domestic.length ? [["#domestic", "국내 학술지 후보"]] : []),
                ].map(([href, label]) => (
                  <a key={href} href={href} className="inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3 font-medium text-ink-2 hover:border-line-strong hover:text-ink">
                    {label}
                  </a>
                ))}
              </nav>

              <section className="mt-10" aria-labelledby="candidates">
                <SectionHeading id="candidates" eyebrow={<SourceLabel source="paper">OpenAlex 논문 기준</SourceLabel>} title="지도교수 후보">
                  주제 적합도와 방법 적합도를 반씩 더한 점수 순입니다. 상위 {TOP}명을 먼저 보여줍니다.
                </SectionHeading>
                <Filters
                  org={orgFilter}
                  setOrg={setOrgFilter}
                  name={nameFilter}
                  setName={setNameFilter}
                  onlyEvidence={onlyEvidence}
                  setOnlyEvidence={setOnlyEvidence}
                  count={filtered.length}
                />
                {result.candidates.length > 0 && filtered.length === 0 && (
                  <p className="mt-4 rounded-lg bg-sunken px-4 py-3 text-sm text-ink-2">필터 조건에 맞는 후보가 없습니다. 필터를 풀어 보세요.</p>
                )}
                {result.candidates.length === 0 && (
                  <p className="mt-4 rounded-lg bg-sunken px-4 py-3 text-sm text-ink-2">
                    조건에 맞는 한국 소속 논문을 찾지 못했습니다. 질문을 더 일반적인 표현으로 바꿔 보세요.
                  </p>
                )}
                <div className="mt-4 space-y-5">
                  {shown.map((c, i) => (
                    <CandidateCard key={c.authorId} c={c} rank={i + 1} side={side} />
                  ))}
                </div>
                {more.length > 0 && (
                  <details className="group mt-5">
                    <summary className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-medium text-ink-2 hover:border-ink-3 hover:text-ink">
                      <Icon name="chevron" className="size-4 transition-transform group-open:rotate-90" />
                      <span className="group-open:hidden">후보 {more.length}명 더 보기</span>
                      <span className="hidden group-open:inline">접기</span>
                    </summary>
                    <div className="mt-5 space-y-5">
                      {more.map((c, i) => (
                        <CandidateCard key={c.authorId} c={c} rank={i + TOP + 1} side={side} />
                      ))}
                    </div>
                    <Caveat className="mt-3">6위부터는 연구실 페이지를 따로 확인하지 않았습니다.</Caveat>
                  </details>
                )}
              </section>

              <OtherPIsSection async={side.projects} />

              <EquipmentSection equip={side.equip} hasEquipItems={hasEquipItems} />

              {result.domestic.status === "failed" ? (
                <p className="mt-14 text-xs text-ink-3">국내 학술지(DBpia) 검색에 실패해 이번 결과에서는 생략했습니다.</p>
              ) : (
                domestic.length > 0 && (
                  <section className="mt-14" aria-labelledby="domestic">
                    <SectionHeading id="domestic" eyebrow={<SourceLabel source="paper">DBpia 국내 학술지</SourceLabel>} title="국내 학술지 후보">
                      국내 학회·학술지 논문의 마지막 저자 기준입니다. DBpia는 소속과 교신저자를 공개하지 않아 위 목록과 합치지 않고 따로 보여줍니다.
                    </SectionHeading>
                    <div className="space-y-5">
                      {domestic.map((c) => (
                        <DomesticCard key={c.ancId} c={c} side={side} />
                      ))}
                    </div>
                  </section>
                )
              )}

              <footer className="mt-14 border-t border-line pt-4 text-xs leading-5 text-ink-3">
                <p>검색 기준: OpenAlex에 등록된 최근 6년 논문 초록.</p>
                <p className="mt-1">
                  검색어: <span className="font-mono">{result.normalized.search_queries.join(" / ")}</span>
                </p>
              </footer>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
