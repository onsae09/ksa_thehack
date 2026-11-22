import type { ReactNode } from "react";
import type { Candidate, DomesticCandidate, NtisProject } from "@/lib/types";
import { TYPE_LABEL, hostOf, type Async, type SideData } from "./data";
import { buildEvidence, coveredCount } from "./evidence";
import { EmailFinder } from "./EmailFinder";
import { InstitutionEquipDetail, PiEquipDetail } from "./Equipment";
import { EvidenceChecklist, EvidenceQuotes } from "./EvidenceChecklist";
import { FitMeters } from "./FitMeter";
import { CandidateProjects } from "./Projects";
import { Badge, ExtLink, Fold, Icon, LinkChip, SourceGlyph, Warning } from "./ui";

const HS_NOTE = "연구실이 고등학생을 받는지는 논문 데이터로 알 수 없으므로 직접 문의가 필요합니다.";

/** 접힌 블록 제목 옆 상태: 확인 중 / N건 / 없음 */
function foldCount(a: Async<unknown>, n: number | undefined): ReactNode {
  if (a.state === "loading") return <span className="text-xs font-normal text-ink-3">확인 중…</span>;
  if (a.state === "failed") return <span className="text-xs font-normal text-ink-3">조회 실패</span>;
  return <span className="font-mono text-xs font-normal tabular text-ink-3">{n ? `${n}건` : "없음"}</span>;
}

function AffiliationBadge({ a }: { a: Candidate["affiliation"] | undefined }) {
  if (!a || a.status === "unknown") return null;
  if (a.status === "current") {
    return (
      <Badge tone="ok" icon="check" title="OpenAlex 저자 기록에서 이 기관 소속으로 최근 논문이 있습니다">
        현재 소속 확인{a.lastYear ? ` (${a.lastYear})` : ""}
      </Badge>
    );
  }
  return (
    <Badge tone="warn" icon="alert" title={a.note ?? "이 기관 소속 논문이 한동안 없습니다. 이동·은퇴했을 수 있습니다."}>
      최근 소속 불확실{a.lastYear ? ` (마지막 ${a.lastYear})` : ""}
    </Badge>
  );
}

function PaperList({ papers }: { papers: (Candidate["topPapers"][number] & { journal?: string })[] }) {
  return (
    <ol className="space-y-2.5">
      {papers.map((p) => (
        <li key={p.id} className="text-sm leading-6">
          <ExtLink href={p.url}>{p.title}</ExtLink>
          <div className="flex flex-wrap gap-x-2 text-xs text-ink-3">
            {p.journal && <span>{p.journal}</span>}
            <span className="font-mono tabular">{p.year}</span>
            <span>
              · 주제 유사도 <span className="font-mono tabular text-ink-2">{p.similarity.toFixed(2)}</span>
            </span>
            <span>
              · 방법 유사도 <span className="font-mono tabular text-ink-2">{p.methodSimilarity.toFixed(2)}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Shell({
  id,
  rank,
  head,
  fit,
  links,
  children,
}: {
  id: string;
  rank?: number;
  head: ReactNode;
  fit: ReactNode;
  links: ReactNode;
  children: ReactNode;
}) {
  return (
    <article id={id} className="scroll-mt-4 rounded-xl border border-line bg-surface animate-rise">
      <div className="p-5 sm:p-6">
        <div className="flex gap-4">
          {rank != null && (
            <span className="font-serif text-3xl leading-none font-bold text-primary/80 tabular sm:text-4xl" aria-label={`${rank}위`}>
              {rank}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">{head}</div>
              <div className="shrink-0">{fit}</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">{links}</div>
          </div>
        </div>
      </div>
      <div className="px-5 pb-2 sm:px-6">{children}</div>
      <p className="border-t border-line px-5 py-3 text-xs text-ink-3 sm:px-6">{HS_NOTE}</p>
    </article>
  );
}

function EvidenceBlock({ children, covered, total }: { children: ReactNode; covered: { person: number; instOnly: number }; total: number }) {
  return (
    <div className="mb-4">
      <h4 className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
        수행 가능성 근거
        <span className="text-xs font-normal text-ink-3">
          필요한 것 {total}개 중 <b className="font-mono tabular text-ink">{covered.person}</b>개에 연구자 근거
          {covered.instOnly > 0 && <> · {covered.instOnly}개는 기관 장비만</>}
        </span>
      </h4>
      {children}
    </div>
  );
}

export function CandidateCard({ c, rank, side }: { c: Candidate; rank: number; side: SideData }) {
  const labsOk = side.labs.state === "ok" ? side.labs.data : null;
  const labEnabled = side.labs.state === "loading" || (labsOk?.status === "ok");
  const lab = labsOk?.status === "ok" ? labsOk.byCandidate[c.authorId] : undefined;
  const eq = side.equip.state === "ok" ? side.equip.data : null;
  const inst = eq?.byInstitution[c.institutionId];
  const piEquip = eq?.byCandidate?.[c.authorId];
  const piEnabled = side.equip.state === "loading" || (!!eq && eq.byCandidate !== undefined);
  const projects: NtisProject[] | undefined = side.projects.state === "ok" ? side.projects.data.byCandidate[c.authorId] : undefined;

  const table = buildEvidence({
    items: c.items,
    lab: { async: side.labs, page: lab, enabled: labEnabled },
    inst: { async: side.equip, data: inst },
    pi: { async: side.equip, data: piEquip, enabled: piEnabled },
  });
  const hasEquipItems = c.items.some((i) => i.kind === "equipment");

  return (
    <Shell
      id={`cand-${c.authorId}`}
      rank={rank}
      head={
        <>
          <h3 className="font-serif text-xl leading-tight font-bold text-ink">
            {c.name}
            {lab?.koName && lab.koName !== c.name && <span className="ml-2 font-sans text-base font-medium text-ink-2">{lab.koName}</span>}
          </h3>
          {lab?.koName && <p className="mt-0.5 text-[11px] text-src-lab">한글 이름은 연구실 페이지 표기</p>}
          <p className="mt-1 text-sm text-ink-2">
            {c.institution}
            <span className="text-ink-3"> · {TYPE_LABEL[c.institutionType] ?? c.institutionType}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <AffiliationBadge a={c.affiliation} />
            {!c.koreanName && <Badge title="국적 정보가 없어 이름 표기로 추정했습니다">외국인 추정</Badge>}
          </div>
          {c.affiliation?.status === "stale" && c.affiliation.note && (
            <p className="mt-1.5 text-xs text-warn">{c.affiliation.note}</p>
          )}
        </>
      }
      fit={<FitMeters c={c} />}
      links={
        <>
          {lab && (
            <a
              href={lab.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-src-lab px-2.5 text-xs font-semibold text-white hover:opacity-90"
              title={lab.title}
            >
              <Icon name="home" className="size-3.5" />
              연구실 홈페이지 <span className="font-normal opacity-80">{hostOf(lab.url)}</span>
              <span className="sr-only"> (새 창)</span>
            </a>
          )}
          {!lab && <LinkChip href={c.links.search} icon="search">연구실 검색</LinkChip>}
          <LinkChip href={c.links.openalex}>논문 목록 (OpenAlex)</LinkChip>
          {c.links.orcid && <LinkChip href={c.links.orcid}>ORCID</LinkChip>}
          <EmailFinder name={c.name} institution={c.institution} hint={c.topPapers[0]?.title ?? ""} />
        </>
      }
    >
      <EvidenceBlock covered={coveredCount(table)} total={c.items.length}>
        <EvidenceChecklist table={table} caption={`${c.name}의 요구 항목별 근거`} />
      </EvidenceBlock>

      <div className="mb-4 space-y-3">
        <EvidenceQuotes items={c.items} quiet={!!c.warning} />
        {lab && lab.equipment.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs">
              <SourceGlyph source="lab" />
              <span className="font-semibold text-ink">연구실 페이지에서 확인</span>
            </div>
            <ul className="space-y-1.5">
              {lab.equipment.map((e) => (
                <li key={e.label} className="border-l-2 border-src-lab/50 pl-3 text-[13px] leading-6 text-ink-2">
                  <b className="font-medium text-ink">{e.label}</b> — “{e.snippet}”{" "}
                  <ExtLink href={lab.url} quiet className="text-xs">
                    {hostOf(lab.url)}
                  </ExtLink>
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.warning && <Warning>{c.warning}</Warning>}
      </div>

      <Fold
        summary={
          <>
            <SourceGlyph source="ntis" /> 최근 국가과제 {foldCount(side.projects, projects?.length)}
          </>
        }
      >
        <CandidateProjects
          async={side.projects}
          list={projects}
          caveat="같은 기관 + 영문 이름 표기로 맞춘 결과라 다른 사람의 과제일 수 있습니다."
        />
      </Fold>

      {hasEquipItems && side.equip.state !== "idle" && (
        <Fold
          summary={
            <>
              <SourceGlyph source="zeusInst" /> 소속 기관 장비 (ZEUS)
              {foldCount(side.equip, inst?.perItem.filter((p) => p.items.length).length)}
            </>
          }
        >
          {inst ? (
            <InstitutionEquipDetail inst={inst} />
          ) : side.equip.state === "ok" ? (
            <p className="text-xs text-ink-3">이 기관의 등록 장비를 찾지 못했습니다.</p>
          ) : (
            <p className="text-xs text-ink-3">ZEUS 확인 중…</p>
          )}
        </Fold>
      )}

      {piEquip && piEquip.length > 0 && (
        <Fold
          summary={
            <>
              <SourceGlyph source="zeusPi" /> 연구책임자 과제로 구축된 장비 {foldCount(side.equip, piEquip.length)}
            </>
          }
        >
          <PiEquipDetail
            name={c.name}
            equip={piEquip}
            caveat="ZEUS의 구축 과제 연구책임자와 이 후보를 기관·이름으로 맞춘 결과입니다. 다른 사람일 수 있으니 보유기관을 확인하세요."
          />
        </Fold>
      )}

      <Fold
        summary={
          <>
            <SourceGlyph source="paper" /> 가까운 논문 <span className="font-mono text-xs font-normal tabular text-ink-3">{c.topPapers.length}편</span>
          </>
        }
      >
        <PaperList papers={c.topPapers} />
      </Fold>
    </Shell>
  );
}

export function DomesticCard({ c, side }: { c: DomesticCandidate; side: SideData }) {
  const eq = side.equip.state === "ok" ? side.equip.data : null;
  const byName = eq?.byName[c.name];
  const projects = side.projects.state === "ok" ? side.projects.data.byDomestic[c.name] : undefined;
  const table = buildEvidence({
    items: c.items,
    pi: { async: side.equip, data: byName, enabled: side.equip.state === "loading" || side.equip.state === "ok" },
  });

  return (
    <Shell
      id={`dom-${c.ancId}`}
      head={
        <>
          <h3 className="font-serif text-lg leading-tight font-bold text-ink">
            {c.name}
            {c.nameEn && c.nameEn !== c.name && <span className="ml-2 font-sans text-sm font-normal text-ink-3">{c.nameEn}</span>}
          </h3>
          <p className="mt-1 text-sm text-ink-2">
            {c.fields.length ? c.fields.join(" · ") : "연구분야 정보 없음"}
            {c.paperCount && <span className="text-ink-3"> · DBpia 논문 {c.paperCount}편</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge title="DBpia는 소속을 공개하지 않습니다">소속 미확인</Badge>
            {!c.koreanName && <Badge title="국적 정보가 없어 이름 표기로 추정했습니다">외국인 추정</Badge>}
          </div>
        </>
      }
      fit={<FitMeters c={c} />}
      links={
        <>
          <LinkChip href={c.links.dbpia}>DBpia 저자 페이지</LinkChip>
          <LinkChip href={c.links.search} icon="search">연구실 검색</LinkChip>
          <EmailFinder
            name={c.nameEn ? `${c.name} (${c.nameEn})` : c.name}
            institution=""
            hint={[c.fields[0], c.topPapers[0]?.title].filter(Boolean).join(" / ")}
          />
        </>
      }
    >
      <EvidenceBlock covered={coveredCount(table)} total={c.items.length}>
        <EvidenceChecklist table={table} caption={`${c.name}의 요구 항목별 근거`} />
      </EvidenceBlock>
      <div className="mb-4 space-y-3">
        <EvidenceQuotes items={c.items} quiet={!!c.warning} />
        {c.warning && <Warning>{c.warning}</Warning>}
      </div>

      <Fold
        summary={
          <>
            <SourceGlyph source="ntis" /> 최근 국가과제 {foldCount(side.projects, projects?.length)}
          </>
        }
      >
        <CandidateProjects
          async={side.projects}
          list={projects}
          caveat="이름만 같은 과제 책임자입니다 (기관 미확인). 동명이인 가능 — 수행기관을 꼭 확인하세요."
        />
      </Fold>

      {byName && byName.length > 0 && (
        <Fold
          summary={
            <>
              <SourceGlyph source="zeusPi" /> 연구책임자 과제로 구축된 장비 {foldCount(side.equip, byName.length)}
            </>
          }
        >
          <PiEquipDetail name={c.name} equip={byName} caveat="이름만 같은 다른 사람일 수 있습니다 (동명이인 가능). 보유기관을 확인하세요." />
        </Fold>
      )}

      <Fold
        summary={
          <>
            <SourceGlyph source="paper" /> 가까운 논문 <span className="font-mono text-xs font-normal tabular text-ink-3">{c.topPapers.length}편</span>
          </>
        }
      >
        <PaperList papers={c.topPapers} />
      </Fold>
    </Shell>
  );
}

