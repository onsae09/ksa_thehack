import type { ReactNode } from "react";
import { ExternalLink, SearchX, Unplug } from "lucide-react";
import type { InstitutionEquipment, NameEquipment } from "@/lib/equipment";
import type { NtisProject, ProjectsResult } from "@/lib/types";
import { formatWon, type Async, type EquipData } from "./data";
import { Caveat, ExtLink, Flag, InlineLoading, Inferred, Quiet, SourceLabel } from "./marks";

/* ───────── NTIS ───────── */

/** 과제 한 줄: 제목(링크) + 기간 · 연구비 · 부처 */
export function ProjectRow({ p, showPi = false }: { p: NtisProject; showPi?: boolean }) {
  const won = formatWon(p.funding);
  return (
    <li className="text-sm leading-6">
      <ExtLink href={p.url} className="text-foreground decoration-input hover:text-primary">
        {p.title}
      </ExtLink>
      <div className="flex flex-wrap gap-x-2 text-xs leading-5 text-muted-foreground">
        <span className="tabular">{p.period ?? `${p.year}년`}</span>
        {won && (
          <span title={`${p.year}년 정부연구비`}>
            · <span className="font-medium text-foreground/80">{won}</span> ({p.year}년)
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

export function CandidateProjects({ async, list, caveat }: { async: Async<ProjectsResult>; list: NtisProject[] | undefined; caveat: string }) {
  if (async.state === "idle") return null;
  if (async.state === "loading") return <InlineLoading>NTIS 국가과제 확인 중</InlineLoading>;
  if (async.state === "failed") return <p className="text-xs text-muted-foreground">국가과제(NTIS) 조회에 실패했습니다.</p>;
  if (!list?.length) return <p className="text-xs text-muted-foreground">이름·기관이 맞는 최근 국가과제가 없습니다.</p>;
  const sorted = [...list].sort((a, b) => b.year - a.year);
  return (
    <div className="space-y-2.5">
      <ul className="space-y-2">
        {sorted.map((p) => (
          <ProjectRow key={p.id} p={p} />
        ))}
      </ul>
      <Caveat>{caveat}</Caveat>
    </div>
  );
}

/** 국가과제 탭: 후보 목록에 없는 과제 책임자 (논문 검색이 놓친 후보일 수 있음) */
export function ProjectsTab({ async }: { async: Async<ProjectsResult> }) {
  return (
    <section aria-labelledby="ntis-title" className="space-y-4">
      <TabIntro id="ntis-title" source={<SourceLabel source="ntis">NTIS 국가R&D 과제</SourceLabel>} title="후보 목록에 없는 과제 책임자">
        논문 검색에는 잡히지 않았지만, 연구 질문과 가까운 국가 R&amp;D 과제를 맡은 연구자입니다. 놓친 지도교수 후보일 수 있으니 직접 확인해 보세요.
      </TabIntro>
      {(async.state === "loading" || async.state === "idle") && <InlineLoading>NTIS에서 관련 국가과제를 찾는 중 (5초 안팎)</InlineLoading>}
      {async.state === "failed" && <Quiet icon={Unplug}>국가과제(NTIS) 검색에 실패해 이번 결과에서는 생략했습니다.</Quiet>}
      {async.state === "ok" &&
        (async.data.projects.length === 0 && async.data.others.length === 0 ? (
          <Quiet icon={SearchX}>관련 국가과제를 찾지 못했습니다. 주제가 좁으면 국가과제가 없을 수 있습니다.</Quiet>
        ) : async.data.others.length === 0 ? (
          <Quiet>관련 국가과제 {async.data.projects.length}건의 책임자는 모두 지도교수 후보 목록에 있습니다.</Quiet>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {async.data.others.map((o) => (
              <li key={`${o.pi}-${o.organ}`} className="rounded-xl border border-border bg-card p-4">
                <h3 className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-foreground">
                  {o.pi}
                  <span className="text-sm font-normal text-muted-foreground">{o.organ}</span>
                </h3>
                <ul className="mt-2.5 space-y-2.5 border-t border-border pt-2.5">
                  {o.projects.slice(0, 3).map((p) => (
                    <ProjectRow key={p.id} p={p} />
                  ))}
                </ul>
                {o.projects.length > 3 && <p className="mt-1.5 text-xs text-muted-foreground">외 {o.projects.length - 3}건</p>}
              </li>
            ))}
          </ul>
        ))}
      {async.state === "ok" && (
        <Caveat>
          NTIS 공개 목록(과제명·책임자·수행기관·연구비) 기준입니다. 후보와의 연결은 기관과 영문 이름 표기로 맞춘 것이라 틀릴 수 있고, 과제명만 비슷한 다른 분야 과제가 섞일 수 있습니다.
        </Caveat>
      )}
    </section>
  );
}

/* ───────── ZEUS ───────── */

export function InstitutionEquipDetail({ inst }: { inst: InstitutionEquipment }) {
  const rows = inst.perItem.filter((p) => p.items.length);
  if (!rows.length) return <p className="text-xs text-muted-foreground">{inst.koName}에 등록된 해당 장비를 찾지 못했습니다.</p>;
  return (
    <div className="space-y-2.5">
      <p className="flex flex-wrap items-center gap-2 text-xs text-foreground/80">
        <span className="font-medium">{inst.koName}</span>
        <Flag tone="warn" title="이 교수 연구실 장비라는 뜻은 아닙니다">
          기관 전체 기준
        </Flag>
      </p>
      <ul className="space-y-2.5 text-sm">
        {rows.map((p) => (
          <li key={p.label} className="leading-6">
            <span className="font-medium text-foreground">{p.label}</span>{" "}
            <span className="text-xs text-muted-foreground tabular">
              {p.items.length}대{p.more ? " 이상" : ""}
            </span>
            <div className="text-xs leading-5 text-foreground/80">
              {p.items.slice(0, 2).map((x, i) => (
                <span key={x.id}>
                  {i > 0 && " · "}
                  <ExtLink href={x.url}>{x.name}</ExtLink>
                  <span className="text-muted-foreground"> ({x.scope || "활용범위 미상"})</span>
                </span>
              ))}{" "}
              <ExtLink href={p.searchUrl} quiet>
                ZEUS에서 보기
              </ExtLink>
            </div>
          </li>
        ))}
      </ul>
      <Caveat>기관 전체 기준이라 이 교수 연구실 장비라는 뜻은 아닙니다.</Caveat>
    </div>
  );
}

export function PiEquipDetail({ equip, caveat }: { equip: NameEquipment; caveat: string }) {
  return (
    <div className="space-y-2.5">
      <ul className="space-y-2 text-sm">
        {equip.map(({ label, equip: e }) => (
          <li key={e.id} className="leading-6">
            <span className="font-medium text-foreground">{label}</span> <ExtLink href={e.url}>{e.name}</ExtLink>
            <span className="text-xs text-muted-foreground">
              {" "}
              · {e.organ}
              {e.scope && ` · ${e.scope}`}
            </span>
          </li>
        ))}
      </ul>
      <Caveat>{caveat}</Caveat>
    </div>
  );
}

/** 장비 탭: 필요한 장비를 가진 곳 (ZEUS) */
export function EquipmentTab({ equip, hasEquipItems }: { equip: Async<EquipData>; hasEquipItems: boolean }) {
  return (
    <section aria-labelledby="zeus-title" className="space-y-4">
      <TabIntro id="zeus-title" source={<SourceLabel source="zeusInst">ZEUS 국가연구시설장비</SourceLabel>} title="필요한 장비를 가진 곳">
        국가 R&amp;D로 산 장비 목록입니다. 지도교수 연구실에 장비가 없어도, 외부 이용이 가능한 장비는 보유기관에 예약해서 쓸 수 있습니다.
      </TabIntro>
      {!hasEquipItems ? (
        <Quiet>이번 질문에는 장비 항목이 없어 ZEUS를 확인하지 않았습니다. 장비·데이터 칸에 적으면 함께 찾습니다.</Quiet>
      ) : equip.state === "loading" || equip.state === "idle" ? (
        <InlineLoading>ZEUS에서 필요한 장비를 보유한 기관을 찾는 중 (5~15초)</InlineLoading>
      ) : equip.state === "failed" ? (
        <Quiet icon={Unplug}>장비 검색(ZEUS)에 실패해 이번 결과에서는 생략했습니다.</Quiet>
      ) : equip.data.items.length === 0 ? (
        <Quiet>ZEUS에서 찾을 장비 항목이 없습니다.</Quiet>
      ) : (
        <>
          <div className="space-y-3">
            {equip.data.items.map((it) => (
              <article key={it.label} className="rounded-xl border border-border bg-card">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                  <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
                    {it.label}
                    {it.inferred && <Inferred />}
                  </h3>
                  <a
                    href={it.searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline"
                  >
                    ZEUS에서 전체 보기
                    <ExternalLink className="size-3" aria-hidden="true" />
                    <span className="sr-only"> (새 창)</span>
                  </a>
                </header>
                <div className="px-4 py-3.5 sm:px-5">
                  {it.total === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      「{it.keyword}」로 등록된 장비가 없습니다. 데이터·소프트웨어이거나 다른 이름으로 등록됐을 수 있습니다.
                    </p>
                  ) : (
                    <>
                      <OpenShare total={it.total} open={it.openTotal} />
                      {it.top.length > 0 && (
                        <ul className="mt-3 divide-y divide-border">
                          {it.top.map((e) => (
                            <li key={e.id} className="py-3 text-sm first:pt-1 last:pb-0">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <ExtLink href={e.url} className="font-medium">
                                  {e.name}
                                </ExtLink>
                                {e.nameEn && <span className="text-xs text-muted-foreground">{e.nameEn}</span>}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground/80">
                                <span>{e.organ}</span>
                                {e.address && <span className="text-muted-foreground">· {e.address.split(" ").slice(0, 2).join(" ")}</span>}
                                {e.scope && <Flag tone={e.scope.includes("서비스") ? "ok" : "neutral"}>{e.scope}</Flag>}
                                {e.status && <span className="text-muted-foreground">{e.status}</span>}
                              </div>
                              <div className="mt-0.5 text-xs leading-5 text-muted-foreground">
                                {e.category}
                                {e.pi && (
                                  <>
                                    {e.category && " · "}구축 과제 연구책임자 {e.pi}
                                    {e.piOrgan && e.piOrgan !== e.organ ? ` (${e.piOrgan})` : ""}
                                  </>
                                )}
                                {e.phone && <> · 문의 {e.phone}</>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <Caveat>
            공동활용서비스 장비는 기관이 외부 이용을 정식으로 받는 장비이고, 공동활용허용 장비는 보유 연구실이 쓰지 않는 시간에만 쓸 수 있습니다. 구축 과제 연구책임자는 장비를 산 과제의 책임자로, 지금 장비를 쓰는 연구실과 다를 수 있습니다.
          </Caveat>
        </>
      )}
    </section>
  );
}

/** 전국 등록 N대 중 외부 이용 가능 M대 — 실제 두 수로만 그린다 */
function OpenShare({ total, open }: { total: number; open: number }) {
  const ratio = total > 0 ? Math.min(1, open / total) : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-foreground/80">
        <span>
          전국 <b className="text-lg font-semibold text-foreground tabular">{total.toLocaleString()}</b>대
        </span>
        <span>
          공동활용 <b className="text-lg font-semibold text-src-zeus tabular">{open.toLocaleString()}</b>대
          <span className="text-xs text-muted-foreground"> (외부 이용 가능)</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted" role="img" aria-label={`전국 ${total}대 중 외부 이용 가능 ${open}대`}>
        <div className="h-full rounded-full bg-src-zeus" style={{ width: `${Math.max(ratio * 100, open > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

export function TabIntro({ id, source, title, children }: { id: string; source: ReactNode; title: string; children: ReactNode }) {
  return (
    <header>
      <div className="mb-1.5">{source}</div>
      <h2 id={id} className="font-serif text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{children}</p>
    </header>
  );
}
