import type { InstitutionEquipment, NameEquipment } from "@/lib/equipment";
import type { Async, EquipData } from "./data";
import { Badge, Caveat, ExtLink, InlineLoading, Inferred, SectionFailed, SectionHeading, SourceLabel } from "./ui";

/** 후보 소속 기관이 ZEUS에 등록한 장비 (연구실이 아니라 기관 전체 기준) */
export function InstitutionEquipDetail({ inst }: { inst: InstitutionEquipment }) {
  const rows = inst.perItem.filter((p) => p.items.length);
  if (!rows.length) return <p className="text-xs text-ink-3">{inst.koName}에 등록된 해당 장비를 찾지 못했습니다.</p>;
  return (
    <div>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
        <span className="font-semibold">{inst.koName}</span>
        <Badge tone="zeus" title="이 교수 연구실 장비라는 뜻은 아닙니다">기관 전체 기준</Badge>
      </p>
      <ul className="space-y-2 text-sm">
        {rows.map((p) => (
          <li key={p.label} className="leading-6">
            <span className="font-medium text-ink">{p.label}</span>{" "}
            <span className="font-mono text-xs tabular text-ink-3">
              {p.items.length}대{p.more ? " 이상" : ""}
            </span>
            <div className="text-xs text-ink-2">
              {p.items.slice(0, 2).map((x, i) => (
                <span key={x.id}>
                  {i > 0 && " · "}
                  <ExtLink href={x.url}>{x.name}</ExtLink>
                  <span className="text-ink-3"> ({x.scope || "활용범위 미상"})</span>
                </span>
              ))}{" "}
              <ExtLink href={p.searchUrl} quiet>
                ZEUS에서 보기
              </ExtLink>
            </div>
          </li>
        ))}
      </ul>
      <Caveat className="mt-2">기관 전체 기준이라 이 교수 연구실 장비라는 뜻은 아닙니다.</Caveat>
    </div>
  );
}

/** 이 사람이 연구책임자인 과제로 구축된 장비 */
export function PiEquipDetail({ name, equip, caveat }: { name: string; equip: NameEquipment; caveat: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-ink-2">{name} 연구책임자 과제로 구축된 장비</p>
      <ul className="space-y-1.5 text-sm">
        {equip.map(({ label, equip: e }) => (
          <li key={e.id} className="leading-6">
            <span className="font-medium text-ink">{label}</span>{" "}
            <ExtLink href={e.url}>{e.name}</ExtLink>
            <span className="text-xs text-ink-3">
              {" "}
              · {e.organ}
              {e.scope && ` · ${e.scope}`}
            </span>
          </li>
        ))}
      </ul>
      <Caveat className="mt-2">{caveat}</Caveat>
    </div>
  );
}

/** 필요한 장비가 어디에 있고 외부에서 쓸 수 있는지 (ZEUS) */
export function EquipmentSection({ equip, hasEquipItems }: { equip: Async<EquipData>; hasEquipItems: boolean }) {
  if (!hasEquipItems || equip.state === "idle") return null;
  return (
    <section className="mt-14" aria-labelledby="zeus">
      <SectionHeading id="zeus" eyebrow={<SourceLabel source="zeusInst">ZEUS 국가연구시설장비</SourceLabel>} title="필요한 장비를 가진 곳">
        국가 R&amp;D로 산 장비 목록입니다. 지도교수 연구실에 장비가 없어도, 외부 이용이 가능한 장비는 보유기관에 예약해서 쓸 수 있습니다.
      </SectionHeading>
      {equip.state === "loading" && <InlineLoading>ZEUS에서 필요한 장비를 보유한 기관을 찾는 중 (5~15초)</InlineLoading>}
      {equip.state === "failed" && <SectionFailed>장비 검색(ZEUS)에 실패해 이번 결과에서는 생략했습니다.</SectionFailed>}
      {equip.state === "ok" && equip.data.items.length === 0 && (
        <p className="rounded-lg bg-sunken px-4 py-3 text-sm text-ink-2">ZEUS에서 찾을 장비 항목이 없습니다.</p>
      )}
      {equip.state === "ok" && equip.data.items.length > 0 && (
        <>
          <div className="space-y-4">
            {equip.data.items.map((it) => (
              <article key={it.label} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                    {it.label}
                    {it.inferred && <Inferred />}
                  </h3>
                  <ExtLink href={it.searchUrl} quiet className="text-xs">
                    ZEUS에서 전체 보기
                  </ExtLink>
                </div>
                {it.total === 0 ? (
                  <p className="mt-2 text-sm text-ink-3">
                    「{it.keyword}」로 등록된 장비가 없습니다. 데이터·소프트웨어이거나 다른 이름으로 등록됐을 수 있습니다.
                  </p>
                ) : (
                  <>
                    <OpenShare total={it.total} open={it.openTotal} />
                    <ul className="mt-4 divide-y divide-line/70">
                      {it.top.map((e) => (
                        <li key={e.id} className="py-3 text-sm first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <ExtLink href={e.url} className="font-semibold">
                              {e.name}
                            </ExtLink>
                            {e.nameEn && <span className="text-xs text-ink-3">{e.nameEn}</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                            <span>{e.organ}</span>
                            {e.address && <span className="text-ink-3">· {e.address.split(" ").slice(0, 2).join(" ")}</span>}
                            {e.scope && <Badge tone={e.scope.includes("서비스") ? "ok" : "neutral"}>{e.scope}</Badge>}
                            {e.status && <span className="text-ink-3">{e.status}</span>}
                          </div>
                          <div className="mt-0.5 text-xs text-ink-3">
                            {e.category && <>{e.category}</>}
                            {e.pi && (
                              <>
                                {" "}
                                · 구축 과제 연구책임자 {e.pi}
                                {e.piOrgan && e.piOrgan !== e.organ ? ` (${e.piOrgan})` : ""}
                              </>
                            )}
                            {e.phone && <> · 문의 {e.phone}</>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </article>
            ))}
          </div>
          <Caveat className="mt-3">
            공동활용서비스 장비는 기관이 외부 이용을 정식으로 받는 장비이고, 공동활용허용 장비는 보유 연구실이 쓰지 않는 시간에만 쓸 수 있습니다. 구축 과제 연구책임자는 장비를 산 과제의 책임자로, 지금 장비를 쓰는 연구실과 다를 수 있습니다.
          </Caveat>
        </>
      )}
    </section>
  );
}

/** 전국 등록 N대 중 외부 이용 가능 M대 — 비율 막대 (실제 두 수로만 그린다) */
function OpenShare({ total, open }: { total: number; open: number }) {
  const ratio = total > 0 ? Math.min(1, open / total) : 0;
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-ink-2">
          전국 <b className="font-mono text-base tabular text-ink">{total.toLocaleString()}</b>대 등록
        </span>
        <span className="text-ink-2">
          외부 이용 가능(공동활용) <b className="font-mono text-base tabular text-src-zeus">{open.toLocaleString()}</b>대
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-line"
        role="img"
        aria-label={`전국 ${total}대 중 외부 이용 가능 ${open}대`}
      >
        <div className="h-full rounded-full bg-src-zeus" style={{ width: `${Math.max(ratio * 100, open > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}
