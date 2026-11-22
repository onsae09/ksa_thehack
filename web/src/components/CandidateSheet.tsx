"use client";

import type { ReactNode } from "react";
import { Check, House, Info, Minus, Search } from "lucide-react";
import type { Candidate, CheckItem, DomesticCandidate, ItemResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KIND_LABEL, hostOf, type Async, type SideData } from "./data";
import { DraftParagraph } from "./DraftParagraph";
import { EmailFinder } from "./EmailFinder";
import { FullTextEvidence } from "./FullTextEvidence";
import { coveredCount, type Cell, type EvidenceTable } from "./evidence";
import { CandidateFlags, orgLine } from "./CandidateTable";
import { CandidateProjects, InstitutionEquipDetail, PiEquipDetail } from "./SideTabs";
import { ExtLink, FIT_HELP, FitLevel, Flag, Highlight, Inferred, LinkButton, SOURCE, SourceLabel, SourceMark, Spinner, WarnNote } from "./marks";
import { candidateView, domesticView } from "./model";

const HS_NOTE = "연구실이 고등학생을 받는지는 논문 데이터로 알 수 없으므로 직접 문의가 필요합니다.";

export type Selected = { kind: "openalex"; c: Candidate; rank: number } | { kind: "domestic"; c: DomesticCandidate } | null;

export function CandidateSheet({
  selected,
  onClose,
  side,
  question,
  checkItems,
}: {
  selected: Selected;
  onClose: () => void;
  side: SideData;
  question: string;
  /** 검색 결과의 normalized.items (본문 확인용 키워드). 없으면 본문 확인 칸을 숨긴다 */
  checkItems?: CheckItem[];
}) {
  return (
    <Sheet open={!!selected} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-l-border bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl md:data-[side=right]:max-w-2xl"
      >
        {selected?.kind === "openalex" && <OpenAlexDetail c={selected.c} rank={selected.rank} side={side} question={question} checkItems={checkItems} />}
        {selected?.kind === "domestic" && <DomesticDetail c={selected.c} side={side} question={question} />}
      </SheetContent>
    </Sheet>
  );
}

/* ───────── 틀 ───────── */

function Frame({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <>
      <SheetHeader className="gap-0 border-b border-border bg-card px-5 pt-5 pb-4 pr-14 sm:px-6">{head}</SheetHeader>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="divide-y divide-border">{children}</div>
      </div>
      <p className="flex gap-2 border-t border-border bg-warn-soft/60 px-5 py-3 text-xs leading-5 text-warn sm:px-6">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {HS_NOTE}
      </p>
    </>
  );
}

function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("px-5 py-5 sm:px-6", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">{title}</h3>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function asyncAside(a: Async<unknown>, n: number | undefined) {
  if (a.state === "loading") return "확인 중";
  if (a.state === "failed") return "조회 실패";
  return n ? `${n}건` : "없음";
}

/* ───────── 근거표: 요구 항목 × 출처 ───────── */

function EvidenceMatrix({ table, caption }: { table: EvidenceTable; caption: string }) {
  const cov = coveredCount(table);
  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">
        필요한 것 {table.rows.length}개 중 <b className="font-semibold text-foreground tabular">{cov.person}</b>개에 연구자 근거
        {cov.instOnly > 0 && <> · {cov.instOnly}개는 기관 장비만</>}
      </p>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[20rem] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 pr-2 text-xs font-medium text-muted-foreground">
                필요한 것
              </th>
              {table.cols.map((c) => (
                <th key={c} scope="col" className="w-16 px-1 py-2 text-center align-bottom" title={SOURCE[c].label}>
                  <span className="flex flex-col items-center gap-1">
                    <SourceMark source={c} />
                    <span className="text-[11px] leading-3 font-medium whitespace-nowrap text-muted-foreground">{SOURCE[c].short}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.item.label} className="border-b border-border last:border-0">
                <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{r.item.label}</span>
                    <span className="text-[11px] text-muted-foreground">{KIND_LABEL[r.item.kind]}</span>
                    {r.item.inferred && <Inferred />}
                  </span>
                </th>
                {table.cols.map((c) => (
                  <td key={c} className="px-1 py-2.5 text-center">
                    <CellMark cell={r.cells[c]} source={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CellMark({ cell, source }: { cell: Cell | undefined; source: keyof typeof SOURCE }) {
  if (!cell || cell.s === "na")
    return (
      <span className="text-xs text-muted-foreground/50" title="해당 없음">
        ·<span className="sr-only">해당 없음</span>
      </span>
    );
  if (cell.s === "loading") return <Spinner label="불러오는 중" className="mx-auto" />;
  if (cell.s === "no")
    return (
      <span className="inline-grid size-6 place-items-center text-muted-foreground/45" title={cell.note}>
        <Minus className="size-4" aria-hidden="true" />
        <span className="sr-only">근거 없음: {cell.note}</span>
      </span>
    );
  const mark = (
    <span className={cn("inline-grid size-6 place-items-center rounded-full text-white", SOURCE[source].bg)}>
      <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
    </span>
  );
  return cell.href ? (
    <a href={cell.href} target="_blank" rel="noreferrer" title={cell.note} className="inline-block rounded-full">
      {mark}
      <span className="sr-only">근거 있음: {cell.note} (새 창)</span>
    </a>
  ) : (
    <span title={cell.note}>
      {mark}
      <span className="sr-only">근거 있음: {cell.note}</span>
    </span>
  );
}

/** 논문 초록에서 찾은 근거 문장 (인용 원문 + 링크) */
function EvidenceQuotes({ items, quiet = false }: { items: ItemResult[]; quiet?: boolean }) {
  const withEv = items.filter((i) => i.evidence);
  if (withEv.length === 0) {
    if (quiet) return null;
    return <p className="text-xs text-muted-foreground">초록에서 방법·장비가 적힌 문장을 찾지 못했습니다.</p>;
  }
  return (
    <ul className="space-y-4">
      {withEv.map((it) => {
        const ev = it.evidence!;
        return (
          <li key={it.label}>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-foreground">{it.label}</span>
              {!ev.onTopic && (
                <Flag title="이 주제로 검색된 논문이 아니라, 같은 연구자의 다른 논문에서 찾은 문장입니다">다른 주제 논문</Flag>
              )}
            </div>
            <blockquote className="border-l-2 border-src-paper/35 pl-3.5 font-serif text-[14px] leading-7 text-foreground/85">
              “<Highlight text={ev.sentence} term={ev.matched} />”
            </blockquote>
            <p className="mt-1 pl-3.5 text-xs leading-5">
              <ExtLink href={ev.url} quiet>
                {ev.paperTitle || "원문 보기"}
              </ExtLink>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function PaperList({ papers }: { papers: (Candidate["topPapers"][number] & { journal?: string })[] }) {
  return (
    <ol className="space-y-3">
      {papers.map((p) => (
        <li key={p.id} className="text-sm leading-6">
          <ExtLink href={p.url} className="text-foreground decoration-input hover:text-primary">
            {p.title}
          </ExtLink>
          <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
            {p.journal && <span>{p.journal}</span>}
            <span className="tabular">{p.year}</span>
            <span>
              · 주제 유사도 <span className="text-foreground/80 tabular">{p.similarity.toFixed(2)}</span>
            </span>
            <span>
              · 방법 유사도 <span className="text-foreground/80 tabular">{p.methodSimilarity.toFixed(2)}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Fits({ c }: { c: { fit: Candidate["fit"]; T: number; methodFit: Candidate["fit"]; M: number } }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2" title={FIT_HELP}>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">주제 적합</span>
        <FitLevel label="주제" level={c.fit} score={c.T} />
      </span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">방법 적합</span>
        <FitLevel label="방법" level={c.methodFit} score={c.M} />
      </span>
    </div>
  );
}

/* ───────── OpenAlex 후보 ───────── */

function OpenAlexDetail({ c, rank, side, question, checkItems }: { c: Candidate; rank: number; side: SideData; question: string; checkItems?: CheckItem[] }) {
  const v = candidateView(c, side);
  const hasEquipItems = c.items.some((i) => i.kind === "equipment");
  return (
    <Frame
      head={
        <>
          <p className="text-xs text-muted-foreground">
            지도교수 후보 <span className="tabular">{rank}</span>위
          </p>
          <SheetTitle className="mt-1 font-serif text-2xl leading-tight font-semibold">
            {c.name}
            {v.ko && v.ko.name !== c.name && <span className="ml-2 font-sans text-lg font-medium text-foreground/70">{v.ko.name}</span>}
          </SheetTitle>
          {v.ko && <p className="mt-0.5 text-xs text-muted-foreground">한글 이름은 {v.ko.source}</p>}
          <SheetDescription className="mt-1 text-sm">{orgLine(c)}</SheetDescription>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <CandidateFlags c={c} full />
          </div>
          {c.affiliation?.status === "stale" && c.affiliation.note && <p className="mt-1.5 text-xs text-warn">{c.affiliation.note}</p>}
          <Fits c={c} />
        </>
      }
    >
      <Section title="연락">
        <div className="flex flex-wrap gap-2">
          {v.lab ? (
            <a
              href={v.lab.url}
              target="_blank"
              rel="noreferrer"
              title={v.lab.title}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-src-lab px-2.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              <House className="size-3.5" aria-hidden="true" />
              연구실 홈페이지 <span className="font-normal opacity-80">{hostOf(v.lab.url)}</span>
              <span className="sr-only"> (새 창)</span>
            </a>
          ) : (
            <LinkButton href={c.links.search} icon={Search}>
              연구실 검색
            </LinkButton>
          )}
          <LinkButton href={c.links.openalex}>논문 목록 (OpenAlex)</LinkButton>
          {c.links.orcid && <LinkButton href={c.links.orcid}>ORCID</LinkButton>}
        </div>
        <div className="mt-3 space-y-3">
          <EmailFinder name={c.name} institution={c.institution} hint={c.topPapers[0]?.title ?? ""} />
          <DraftParagraph c={c} question={question} koName={v.ko?.name ?? undefined} />
        </div>
      </Section>

      <Section title="수행 가능성 근거">
        <EvidenceMatrix table={v.table} caption={`${c.name}의 요구 항목별 근거`} />
      </Section>

      <Section title={<SourceLabel source="paper" className="text-sm font-semibold text-foreground">논문 초록의 근거 문장</SourceLabel>}>
        <div className="space-y-4">
          <EvidenceQuotes items={c.items} quiet={!!c.warning} />
          {c.warning && <WarnNote>{c.warning}</WarnNote>}
        </div>
      </Section>

      {!!checkItems?.length && (
        <Section title={<SourceLabel source="paper" className="text-sm font-semibold text-foreground">논문 본문에서 확인</SourceLabel>} aside="공개 PDF만">
          <FullTextEvidence key={c.authorId} authorId={c.authorId} papers={c.topPapers} items={checkItems} abstractItems={c.items} auto={rank <= 5} />
        </Section>
      )}

      {v.lab && v.lab.equipment.length > 0 && (
        <Section title={<SourceLabel source="lab" className="text-sm font-semibold text-foreground">연구실 페이지에서 확인</SourceLabel>}>
          <ul className="space-y-2">
            {v.lab.equipment.map((e) => (
              <li key={e.label} className="border-l-2 border-src-lab/40 pl-3.5 text-[13px] leading-6 text-foreground/85">
                <b className="font-medium text-foreground">{e.label}</b> — “{e.snippet}”{" "}
                <ExtLink href={v.lab!.url} quiet className="text-xs">
                  {hostOf(v.lab!.url)}
                </ExtLink>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={<SourceLabel source="ntis" className="text-sm font-semibold text-foreground">최근 국가과제</SourceLabel>} aside={asyncAside(side.projects, v.projects?.length)}>
        <CandidateProjects async={side.projects} list={v.projects} caveat="같은 기관 + 영문 이름 표기로 맞춘 결과라 다른 사람의 과제일 수 있습니다." />
      </Section>

      {hasEquipItems && side.equip.state !== "idle" && (
        <Section
          title={<SourceLabel source="zeusInst" className="text-sm font-semibold text-foreground">소속 기관 장비 (ZEUS)</SourceLabel>}
          aside={asyncAside(side.equip, v.inst?.perItem.filter((p) => p.items.length).length)}
        >
          {v.inst ? (
            <InstitutionEquipDetail inst={v.inst} />
          ) : side.equip.state === "loading" ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner /> ZEUS 확인 중
            </p>
          ) : side.equip.state === "failed" ? (
            <p className="text-xs text-muted-foreground">장비 검색(ZEUS)에 실패했습니다.</p>
          ) : (
            <p className="text-xs text-muted-foreground">이 기관의 등록 장비를 찾지 못했습니다.</p>
          )}
        </Section>
      )}

      {v.piEquip && v.piEquip.length > 0 && (
        <Section title={<SourceLabel source="zeusPi" className="text-sm font-semibold text-foreground">연구책임자 과제로 구축된 장비</SourceLabel>} aside={`${v.piEquip.length}건`}>
          <PiEquipDetail
            equip={v.piEquip}
            caveat="ZEUS의 구축 과제 연구책임자와 이 후보를 기관·이름으로 맞춘 결과입니다. 다른 사람일 수 있으니 보유기관을 확인하세요."
          />
        </Section>
      )}

      <Section title="가까운 논문" aside={`${c.topPapers.length}편`}>
        <PaperList papers={c.topPapers} />
      </Section>
    </Frame>
  );
}

/* ───────── DBpia 후보 ───────── */

function DomesticDetail({ c, side, question }: { c: DomesticCandidate; side: SideData; question: string }) {
  const v = domesticView(c, side);
  return (
    <Frame
      head={
        <>
          <p className="text-xs text-muted-foreground">국내 학술지 후보 (DBpia)</p>
          <SheetTitle className="mt-1 font-serif text-2xl leading-tight font-semibold">
            {c.name}
            {c.nameEn && c.nameEn !== c.name && <span className="ml-2 font-sans text-base font-normal text-muted-foreground">{c.nameEn}</span>}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm">
            {c.fields.length ? c.fields.join(" · ") : "연구분야 정보 없음"}
            {c.paperCount && ` · DBpia 논문 ${c.paperCount}편`}
          </SheetDescription>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Flag title="DBpia는 소속을 공개하지 않습니다">소속 미확인</Flag>
            {!c.koreanName && <Flag title="국적 정보가 없어 이름 표기로 추정했습니다">외국인 추정</Flag>}
          </div>
          <Fits c={c} />
        </>
      }
    >
      <Section title="연락">
        <div className="flex flex-wrap gap-2">
          <LinkButton href={c.links.dbpia}>DBpia 저자 페이지</LinkButton>
          <LinkButton href={c.links.search} icon={Search}>
            연구실 검색
          </LinkButton>
        </div>
        <div className="mt-3 space-y-3">
          <EmailFinder
            name={c.nameEn ? `${c.name} (${c.nameEn})` : c.name}
            institution=""
            hint={[c.fields[0], c.topPapers[0]?.title].filter(Boolean).join(" / ")}
          />
          <DraftParagraph c={c} question={question} />
        </div>
      </Section>

      <Section title="수행 가능성 근거">
        <EvidenceMatrix table={v.table} caption={`${c.name}의 요구 항목별 근거`} />
      </Section>

      <Section title={<SourceLabel source="paper" className="text-sm font-semibold text-foreground">논문 초록의 근거 문장</SourceLabel>}>
        <div className="space-y-4">
          <EvidenceQuotes items={c.items} quiet={!!c.warning} />
          {c.warning && <WarnNote>{c.warning}</WarnNote>}
        </div>
      </Section>

      <Section title={<SourceLabel source="ntis" className="text-sm font-semibold text-foreground">최근 국가과제</SourceLabel>} aside={asyncAside(side.projects, v.projects?.length)}>
        <CandidateProjects async={side.projects} list={v.projects} caveat="이름만 같은 과제 책임자입니다 (기관 미확인). 동명이인 가능 — 수행기관을 꼭 확인하세요." />
      </Section>

      {v.byName && v.byName.length > 0 && (
        <Section title={<SourceLabel source="zeusPi" className="text-sm font-semibold text-foreground">연구책임자 과제로 구축된 장비</SourceLabel>} aside={`${v.byName.length}건`}>
          <PiEquipDetail equip={v.byName} caveat="이름만 같은 다른 사람일 수 있습니다 (동명이인 가능). 보유기관을 확인하세요." />
        </Section>
      )}

      <Section title="가까운 논문" aside={`${c.topPapers.length}편`}>
        <PaperList papers={c.topPapers} />
      </Section>
    </Frame>
  );
}

