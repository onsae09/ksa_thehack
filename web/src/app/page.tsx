"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, BookOpenCheck, RotateCcw, SearchX, Unplug, X } from "lucide-react";
import type { Extracted } from "@/app/api/extract/route";
import type { DatasetsResult, LabPagesResult, ProjectsResult, SearchInput, SearchProgressEvent, SearchResult } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandidateSheet, type Selected } from "@/components/CandidateSheet";
import { CandidateTable, DomesticTable, ReviewGroup, SourceLegend, TOP } from "@/components/CandidateTable";
import { AdvisorCard, FitSummary } from "@/components/FitInsight";
import { useAdvisorLookup, useFitAnalysis, withAdvisorSide } from "@/components/insight";
import { Composer, EXAMPLES, QueryBar } from "@/components/Composer";
import { IDLE_SIDE, KIND_LABEL, postJSON, type Async, type EquipData, type SideData } from "@/components/data";
import { Filters, NO_EQUIP_FILTER, type EquipFilter, type NameFilter, type OrgFilter, type RegionFilter } from "@/components/Filters";
import { candidateView, itemCell } from "@/components/model";
import { Caveat, Inferred, Quiet, SourceLabel, Spinner } from "@/components/marks";
import { DatasetsTab, EquipmentTab, ProjectsTab, TabIntro } from "@/components/SideTabs";
import { SearchProgress } from "@/components/SearchProgress";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [methods, setMethods] = useState<string[]>([]);
  const [equipment, setEquipment] = useState("");
  const [data, setData] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SearchProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [lastInput, setLastInput] = useState<SearchInput | null>(null);
  const [editing, setEditing] = useState(false);
  const [onlyEvidence, setOnlyEvidence] = useState(false);
  const [nameFilter, setNameFilter] = useState<NameFilter>("all");
  const [orgFilter, setOrgFilter] = useState<OrgFilter>("all");
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [equipFilter, setEquipFilter] = useState<EquipFilter>(NO_EQUIP_FILTER);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Extracted | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [side, setSide] = useState<SideData>(IDLE_SIDE);
  const [tab, setTab] = useState("candidates");
  const [selected, setSelected] = useState<Selected>(null);
  const runId = useRef(0);
  const lastQuestion = useRef("");

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

    // 데이터 항목: ZEUS가 아니라 공공데이터포털에서 받을 수 있는 데이터셋
    const dataItems = r.normalized.items.filter((i) => i.kind === "data").map((i) => ({ label: i.label, keywords_ko: i.keywords_ko }));
    if (dataItems.length) {
      put("datasets", { state: "loading" });
      postJSON<DatasetsResult>("/api/datasets", { items: dataItems })
        .then((d) => put("datasets", d.status === "ok" ? { state: "ok", data: d } : { state: "failed" }))
        .catch(() => put("datasets", { state: "failed" }));
    }

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
    setExtractError(null);
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
      setData((ex.data ?? []).join(", "));
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "제안서 분석에 실패했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  async function run(input: SearchInput, fresh = false) {
    const id = ++runId.current;
    lastQuestion.current = input.question;
    setLastInput(input);
    setEditing(false);
    setLoading(true);
    setProgress([]);
    setError(null);
    setResult(null);
    setSelected(null);
    setTab("candidates");
    setSide(IDLE_SIDE);
    window.scrollTo({ top: 0 });
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, ...(fresh ? { fresh: true } : {}), stream: true }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "오류가 발생했습니다.");
      }
      // 서버가 단계마다 한 줄(JSON)씩 보낸다: progress … → result 또는 error
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      let data: SearchResult | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as
            | ({ type: "progress" } & SearchProgressEvent)
            | { type: "result"; result: SearchResult }
            | { type: "error"; error: string };
          if (runId.current !== id) return;
          if (msg.type === "progress") {
            setProgress((p) => [...p, { stage: msg.stage, status: msg.status, detail: msg.detail }]);
          } else if (msg.type === "result") data = msg.result;
          else throw new Error(msg.error);
        }
      }
      if (!data) throw new Error("검색 결과를 받지 못했습니다. 다시 시도해 주세요.");
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
    setData(ex.data ?? "");
    run({ question: ex.question, methods: ex.methods, equipment: ex.equipment, data: ex.data });
  }

  // 장비 필터: 표의 근거 칸과 같은 계산(논문·연구실·ZEUS 과제 장비·ZEUS 기관 보유)으로 판정
  const equipOptions = result?.normalized.items.filter((i) => i.kind === "equipment").map((i) => i.label) ?? [];
  const equipLabel = equipOptions.includes(equipFilter.label) ? equipFilter.label : "all"; // 새 검색에 없는 항목이면 해제
  const hasEquip = (c: SearchResult["candidates"][number]) => {
    if (equipLabel === "all") return true;
    const { hits } = itemCell(candidateView(c, side).table, equipLabel);
    return hits.some((h) => h === "paper" || h === "lab" || h === "zeusPi" || (equipFilter.scope === "institution" && h === "zeusInst"));
  };
  const equipPending = side.equip.state === "loading" || side.labs.state === "loading";

  // 지역 외 필터를 먼저 걸고, 남은 후보로 지역별 수를 센다 (선택지에 0명 지역이 안 보이도록)
  const preRegion =
    result?.candidates.filter(
      (c) =>
        (!onlyEvidence || c.items.some((i) => i.evidence)) &&
        (nameFilter === "all" || (nameFilter === "korean") === c.koreanName) &&
        (orgFilter === "all" || orgFilter === c.orgKind) &&
        hasEquip(c),
    ) ?? [];
  const regionCounts = new Map<string | null, number>();
  for (const c of preRegion) regionCounts.set(c.sido ?? null, (regionCounts.get(c.sido ?? null) ?? 0) + 1);
  const filtered = preRegion.filter((c) => regionFilter === "all" || (regionFilter === "unknown" ? !c.sido : c.sido === regionFilter));
  // 순위 표(본 순위 + 근거 약한 후보)와 "소속 확인 필요" 묶음 (lib/pipeline.ts groupOf 규칙)
  const ranked = filtered.filter((c) => (c.group ?? "main") !== "affiliation");
  const review = filtered.filter((c) => c.group === "affiliation");
  // 연락 예정 교수(상위 15명 밖일 때 따로 조회)와 맞는 점·빈틈 분석: 다른 출처처럼 결과가 나온 뒤 불러온다
  const advisorLookup = useAdvisorLookup(proposal?.planned_advisor, result, lastInput?.question ?? "");
  const sheetSide = withAdvisorSide(side, advisorLookup);
  const displayName = (c: SearchResult["candidates"][number]) => {
    const ko = candidateView(c, sheetSide).ko;
    return ko && ko.name !== c.name ? `${c.name} (${ko.name})` : c.name;
  };
  const fit = useFitAnalysis(result, side, advisorLookup, lastInput?.question ?? "", displayName);
  const fitNameOf = (id: string) => {
    const c = result?.candidates.find((x) => x.authorId === id) ?? (advisorLookup.state === "ok" ? advisorLookup.data.candidate : null);
    return c && c.authorId === id ? displayName(c) : null;
  };
  const domestic = result?.domestic.candidates.filter((c) => nameFilter === "all" || (nameFilter === "korean") === c.koreanName) ?? [];
  const hasEquipItems = !!result?.normalized.items.some((i) => i.kind === "equipment");
  const hasDataItems = !!result?.normalized.items.some((i) => i.kind === "data");
  const started = lastInput !== null;
  const showComposer = !started || editing;

  const composer = (
    <Composer
      question={question}
      methods={methods}
      equipment={equipment}
      data={data}
      setData={setData}
      setQuestion={setQuestion}
      setMethods={setMethods}
      setEquipment={setEquipment}
      loading={loading}
      extracting={extracting}
      proposal={proposal}
      fileName={fileName}
      onUpload={uploadProposal}
      onSubmit={() => run({ question, methods, equipment, data: data.trim() || undefined })}
    />
  );

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        본문으로 건너뛰기
      </a>

      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              if (!started) return;
              runId.current++;
              setLastInput(null);
              setResult(null);
              setError(null);
              setLoading(false);
              setEditing(false);
            }}
            className="flex items-center gap-2 text-foreground"
            aria-label="LabFit KR 처음으로"
          >
            <BookOpenCheck className="size-5 text-primary" aria-hidden="true" />
            <span className="text-[17px] font-semibold tracking-tight">
              LabFit <span className="text-primary">KR</span>
            </span>
          </button>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted-foreground sm:inline">고등학생 R&amp;E 지도교수 찾기</span>
            <Link href="/overview" className="text-foreground/80 underline-offset-4 hover:text-primary hover:underline">
              서비스 소개
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {!started && (
          <>
            <section className="mx-auto w-full max-w-6xl px-4 pt-14 text-center sm:px-6 sm:pt-20">
              <h1 className="font-serif text-[1.85rem] leading-[1.3] font-semibold tracking-[-0.01em] text-foreground sm:text-5xl sm:leading-[1.2]">
                그 주제를 그 방법으로
                <br />
                연구해 본 교수님을 찾아요
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-foreground/75 sm:text-[17px]">
                연구 질문과 쓰려는 방법을 넣으면, 한국 연구자의 논문 초록에서 근거 문장을 찾아 지도교수 후보를 보여줍니다.
              </p>
            </section>

            <section aria-label="질문 입력" className="mx-auto mt-10 w-full max-w-6xl px-4 sm:mt-14 sm:px-6">
              <div className="stipple rounded-3xl border border-border/70 px-3 py-10 sm:px-10 sm:py-20">
                <div className="mx-auto max-w-3xl">
                  {composer}
                  {extractError && <ExtractError message={extractError} />}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs font-medium text-foreground/70">예시로 해보기</span>
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex.title}
                        type="button"
                        disabled={loading || extracting}
                        onClick={() => pickExample(ex)}
                        className="h-8 rounded-full border border-border bg-card/90 px-3 text-xs font-medium text-foreground/80 transition-colors hover:border-input hover:bg-card hover:text-foreground disabled:opacity-50"
                      >
                        {ex.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section aria-label="이 서비스의 원칙" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
              <ul className="grid gap-6 sm:grid-cols-3 sm:gap-10">
                {[
                  ["모든 근거에 출처 링크", "근거 문장마다 논문 원문 링크가 붙어 있어 직접 확인할 수 있어요."],
                  ["추정은 추정이라고 표시", "이름·소속·장비를 추정한 곳에는 꼬리표를 붙입니다."],
                  ["없는 내용은 만들지 않음", "근거를 못 찾으면 못 찾았다고 씁니다. 못 한다는 뜻은 아니에요."],
                ].map(([t, d]) => (
                  <li key={t} className="border-t border-border pt-4">
                    <p className="font-serif text-[17px] font-semibold text-foreground">{t}</p>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{d}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-10 text-xs leading-5 text-muted-foreground">
                OpenAlex·DBpia 논문, ZEUS 국가연구시설장비, NTIS 국가R&amp;D 과제의 공개 정보를 씁니다. 올린 제안서 PDF는 저장하지 않습니다.
              </p>
            </section>
          </>
        )}

        {started && (
          <>
            <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
              <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
                {editing ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">질문 수정</p>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      <X aria-hidden="true" />
                      닫기
                    </Button>
                  </div>
                ) : (
                  <QueryBar
                    input={lastInput}
                    loading={loading}
                    cachedAt={result?.cachedAt}
                    onFresh={() => run(lastInput, true)}
                    onEdit={() => {
                      setEditing(true);
                      window.scrollTo({ top: 0 });
                    }}
                    meta={
                      result
                        ? `논문 ${result.stats.papers.toLocaleString()}편 · 책임저자 ${result.stats.authors.toLocaleString()}명 · 후보 ${result.candidates.length}명 · ${(result.stats.ms / 1000).toFixed(1)}초`
                        : null
                    }
                  />
                )}
              </div>
            </div>

            <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-20 sm:px-6">
              {showComposer && (
                <div className="mb-8 rounded-3xl border border-border/70 stipple px-3 py-6 sm:px-8 sm:py-10">
                  <div className="mx-auto max-w-3xl">
                    {composer}
                    {extractError && <ExtractError message={extractError} />}
                  </div>
                </div>
              )}

              {error && (
                <Alert variant="destructive" className="mb-6 border-destructive/30 bg-card">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>검색하지 못했습니다</AlertTitle>
                  <AlertDescription>
                    <p>{error}</p>
                    {lastInput && !loading && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => run(lastInput)}>
                        <RotateCcw aria-hidden="true" />
                        다시 시도
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {loading && <SearchProgress events={progress} />}

              {result && (
                <div className="animate-rise">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="mr-1 text-xs text-muted-foreground">확인한 요구 항목</span>
                    {result.normalized.items.map((i) => (
                      <span key={i.label} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs">
                        <span className="text-muted-foreground">{KIND_LABEL[i.kind]}</span>
                        <span className="font-medium text-foreground">{i.label}</span>
                        {i.inferred && <Inferred />}
                      </span>
                    ))}
                  </div>

                  {proposal?.planned_advisor && (
                    <AdvisorCard
                      advisor={proposal.planned_advisor}
                      result={result}
                      lookup={advisorLookup}
                      onOpenRanked={(i) => {
                        const c = result.candidates[i];
                        setTab("candidates");
                        setSelected({ kind: "openalex", c, rank: c.group === "affiliation" ? null : i + 1 });
                      }}
                      onOpenDomestic={(i) => {
                        setTab("domestic");
                        setSelected({ kind: "domestic", c: result.domestic.candidates[i] });
                      }}
                      onOpenPinned={(c, headline) => setSelected({ kind: "openalex", c, rank: null, headline })}
                    />
                  )}

                  <Tabs value={tab} onValueChange={setTab} className="mt-6 gap-5">
                    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                      <TabsList variant="line" className="h-10 group-data-horizontal/tabs:h-10 w-full justify-start gap-3 border-b sm:gap-5 border-border p-0">
                        <Tab value="candidates" label="지도교수 후보" count={filtered.length} />
                        <Tab
                          value="domestic"
                          label="국내 학술지"
                          count={result.domestic.status === "failed" ? undefined : domestic.length}
                        />
                        <Tab value="equipment" label="장비" sub="ZEUS" loading={side.equip.state === "loading"} />
                        {hasDataItems && <Tab value="datasets" label="데이터" sub="공공데이터" loading={side.datasets.state === "loading"} />}
                        <Tab
                          value="projects"
                          label="국가과제"
                          sub="NTIS"
                          loading={side.projects.state === "loading"}
                          count={side.projects.state === "ok" ? side.projects.data.others.length : undefined}
                        />
                      </TabsList>
                    </div>

                    <TabsContent value="candidates" className="space-y-4">
                      <div className="rounded-xl border border-border bg-muted/50 px-3 py-3 sm:px-4">
                        <Filters
                          org={orgFilter}
                          setOrg={setOrgFilter}
                          name={nameFilter}
                          setName={setNameFilter}
                          onlyEvidence={onlyEvidence}
                          setOnlyEvidence={setOnlyEvidence}
                          region={regionFilter}
                          setRegion={setRegionFilter}
                          regionCounts={regionCounts}
                          equip={{ ...equipFilter, label: equipLabel }}
                          setEquip={setEquipFilter}
                          equipOptions={equipOptions}
                          equipPending={equipPending}
                          count={filtered.length}
                          total={result.candidates.length}
                        />
                      </div>
                      <Caveat>
                        주제 적합도와 방법 적합도를 반씩 더한 점수 순입니다. 한국인/외국인은 국적 정보가 없어 이름 표기로 추정했고, 지역은 OpenAlex 기관 주소 기준이라 분교·캠퍼스가 다르면 틀릴 수 있습니다. 행을 누르면 근거 문장과 출처가 열립니다.
                      </Caveat>
                      {result.candidates.length > 0 && <FitSummary fit={fit} nameOf={fitNameOf} />}
                      {result.candidates.length === 0 ? (
                        <Quiet icon={SearchX}>조건에 맞는 한국 소속 논문을 찾지 못했습니다. 질문을 더 일반적인 표현으로 바꿔 보세요.</Quiet>
                      ) : filtered.length === 0 && equipLabel !== "all" && equipFilter.scope === "person" ? (
                        <Quiet>
                          논문 초록·연구실 페이지·본인 과제 장비에서 「{equipLabel}」 근거가 확인된 후보가 없습니다. 초록에 장비 이름을 잘 쓰지 않는 분야라면{" "}
                          <button
                            type="button"
                            onClick={() => setEquipFilter({ ...equipFilter, scope: "institution" })}
                            className="font-medium text-primary underline underline-offset-[3px]"
                          >
                            소속 기관 보유 장비까지 포함
                          </button>
                          해서 보거나, 후보를 눌러 논문 본문 확인 결과를 보세요.
                        </Quiet>
                      ) : filtered.length === 0 ? (
                        <Quiet>필터 조건에 맞는 후보가 없습니다. 필터를 풀어 보세요.</Quiet>
                      ) : ranked.length === 0 ? null : (
                        <CandidateTable
                          candidates={ranked}
                          items={result.normalized.items}
                          side={side}
                          onOpen={(c, rank) => setSelected({ kind: "openalex", c, rank })}
                        />
                      )}
                      <ReviewGroup candidates={review} onOpen={(c) => setSelected({ kind: "openalex", c, rank: null })} />
                      <SourceLegend labsShown={side.labs.state === "loading" || (side.labs.state === "ok" && side.labs.data.status === "ok")} />
                    </TabsContent>

                    <TabsContent value="domestic" className="space-y-4">
                      <TabIntro id="dbpia-title" source={<SourceLabel source="paper">DBpia 국내 학술지</SourceLabel>} title="국내 학술지 후보">
                        국내 학회·학술지 논문의 마지막 저자 기준입니다. DBpia는 소속과 교신저자를 공개하지 않아 지도교수 후보 목록과 합치지 않고 따로 보여줍니다.
                      </TabIntro>
                      {result.domestic.status === "failed" ? (
                        <Quiet icon={Unplug}>국내 학술지(DBpia) 검색에 실패해 이번 결과에서는 생략했습니다.</Quiet>
                      ) : domestic.length === 0 ? (
                        <Quiet icon={SearchX}>
                          {result.domestic.candidates.length > 0 ? "이름 필터에 맞는 국내 학술지 후보가 없습니다." : "이 주제로 찾은 국내 학술지 후보가 없습니다."}
                        </Quiet>
                      ) : (
                        <DomesticTable
                          candidates={domestic}
                          items={result.normalized.items}
                          side={side}
                          onOpen={(c) => setSelected({ kind: "domestic", c })}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="equipment">
                      <EquipmentTab equip={side.equip} hasEquipItems={hasEquipItems} />
                    </TabsContent>

                    <TabsContent value="datasets">
                      <DatasetsTab async={side.datasets} hasDataItems={hasDataItems} />
                    </TabsContent>

                    <TabsContent value="projects">
                      <ProjectsTab async={side.projects} />
                    </TabsContent>
                  </Tabs>

                  <footer className="mt-14 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                    <p>검색 기준: OpenAlex에 등록된 최근 6년 논문 초록.</p>
                    <p className="mt-1">
                      검색어: <span className="font-mono">{result.normalized.search_queries.join(" / ")}</span>
                    </p>
                  </footer>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <CandidateSheet
        selected={selected}
        onClose={() => setSelected(null)}
        side={sheetSide}
        question={lastInput?.question ?? ""}
        checkItems={result?.normalized.items}
        fit={fit}
      />
    </>
  );
}

function Tab({ value, label, sub, count, loading }: { value: string; label: string; sub?: string; count?: number; loading?: boolean }) {
  return (
    <TabsTrigger
      value={value}
      className="h-10 flex-none rounded-none border-0 px-0.5 text-sm text-muted-foreground group-data-horizontal/tabs:after:bottom-0 after:bg-primary focus-visible:rounded-sm focus-visible:border-transparent focus-visible:bg-accent focus-visible:ring-0 focus-visible:outline-none sm:text-[15px] data-active:text-foreground"
    >
      {label}
      {sub && <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{sub}</span>}
      {loading ? (
        <Spinner label={`${label} 불러오는 중`} className="size-3" />
      ) : count !== undefined ? (
        <span className="rounded-full bg-muted px-1.5 text-xs font-normal text-muted-foreground tabular">{count}</span>
      ) : null}
    </TabsTrigger>
  );
}

function ExtractError({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/25 bg-card px-3 py-2 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}
