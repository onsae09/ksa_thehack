import type { NtisProject, ProjectsResult } from "@/lib/types";
import type { Async } from "./data";
import { formatWon } from "./data";
import { Caveat, ExtLink, InlineLoading, SectionFailed, SectionHeading, SourceLabel } from "./ui";

/** 과제 한 줄: 제목(링크) + 연도·기간 · 연구비 · 부처 */
function ProjectRow({ p, showPi = false }: { p: NtisProject; showPi?: boolean }) {
  const won = formatWon(p.funding);
  return (
    <li className="text-sm leading-6">
      <ExtLink href={p.url}>{p.title}</ExtLink>
      <div className="flex flex-wrap gap-x-2 text-xs text-ink-3">
        <span className="font-mono tabular">{p.period ?? `${p.year}년`}</span>
        {won && (
          <span title={`${p.year}년 정부연구비`}>
            · <span className="font-medium text-ink-2">{won}</span>
            <span className="text-ink-3">({p.year}년)</span>
          </span>
        )}
        {p.ministry && <span>· {p.ministry}</span>}
        {p.program && <span className="hidden sm:inline">· {p.program}</span>}
        {showPi && (
          <span>
            · 책임자 {p.pi} ({p.organ})
          </span>
        )}
      </div>
    </li>
  );
}

/** 후보 카드 안 "최근 국가과제" */
export function CandidateProjects({
  async,
  list,
  caveat,
}: {
  async: Async<ProjectsResult>;
  list: NtisProject[] | undefined;
  caveat: string;
}) {
  if (async.state === "idle") return null;
  if (async.state === "loading") return <InlineLoading>NTIS 국가과제 확인 중</InlineLoading>;
  if (async.state === "failed") return <SectionFailed>국가과제(NTIS) 조회에 실패했습니다.</SectionFailed>;
  if (!list?.length) return <p className="text-xs text-ink-3">이름·기관이 맞는 최근 국가과제가 없습니다.</p>;
  const sorted = [...list].sort((a, b) => b.year - a.year);
  return (
    <div>
      <ul className="space-y-2">
        {sorted.slice(0, 3).map((p) => (
          <ProjectRow key={p.id} p={p} />
        ))}
      </ul>
      {sorted.length > 3 && (
        <details className="mt-2">
          <summary className="text-xs font-medium text-primary hover:underline">과제 {sorted.length - 3}건 더 보기</summary>
          <ul className="mt-2 space-y-2">
            {sorted.slice(3).map((p) => (
              <ProjectRow key={p.id} p={p} />
            ))}
          </ul>
        </details>
      )}
      <Caveat className="mt-2">{caveat}</Caveat>
    </div>
  );
}

/** 후보 목록에 없는 과제 책임자 — 논문 검색이 놓친 지도교수 후보일 수 있다 */
export function OtherPIsSection({ async }: { async: Async<ProjectsResult> }) {
  if (async.state === "idle") return null;
  return (
    <section className="mt-14" aria-labelledby="ntis-others">
      <SectionHeading
        id="ntis-others"
        eyebrow={<SourceLabel source="ntis" />}
        title="후보 목록에 없는 과제 책임자"
      >
        논문 검색에는 잡히지 않았지만, 연구 질문과 가까운 국가 R&amp;D 과제를 맡은 연구자입니다. 놓친 지도교수 후보일 수 있으니 직접 확인해 보세요.
      </SectionHeading>
      {async.state === "loading" && <InlineLoading>NTIS에서 관련 국가과제를 찾는 중 (5초 안팎)</InlineLoading>}
      {async.state === "failed" && <SectionFailed>국가과제(NTIS) 검색에 실패해 이번 결과에서는 생략했습니다.</SectionFailed>}
      {async.state === "ok" &&
        (async.data.projects.length === 0 && async.data.others.length === 0 ? (
          <p className="rounded-lg bg-sunken px-4 py-3 text-sm text-ink-2">관련 국가과제를 찾지 못했습니다. 주제가 좁으면 국가과제가 없을 수 있습니다.</p>
        ) : async.data.others.length === 0 ? (
          <p className="rounded-lg bg-sunken px-4 py-3 text-sm text-ink-2">
            관련 국가과제 {async.data.projects.length}건의 책임자는 모두 위 후보 목록에 있습니다.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {async.data.others.map((o) => (
              <article key={`${o.pi}-${o.organ}`} className="rounded-lg border border-line bg-surface p-4">
                <h3 className="text-base font-semibold text-ink">
                  {o.pi}
                  <span className="ml-2 text-sm font-normal text-ink-2">{o.organ}</span>
                </h3>
                <ul className="mt-2 space-y-2">
                  {o.projects.slice(0, 3).map((p) => (
                    <ProjectRow key={p.id} p={p} />
                  ))}
                </ul>
                {o.projects.length > 3 && <p className="mt-1 text-xs text-ink-3">외 {o.projects.length - 3}건</p>}
              </article>
            ))}
          </div>
        ))}
      {async.state === "ok" && (
        <Caveat className="mt-3">
          NTIS 공개 목록(과제명·책임자·수행기관·연구비) 기준입니다. 후보와의 연결은 기관과 영문 이름 표기로 맞춘 것이라 틀릴 수 있고, 과제명만 비슷한 다른 분야 과제가 섞일 수 있습니다.
        </Caveat>
      )}
    </section>
  );
}
