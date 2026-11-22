import type { Extracted } from "@/app/api/extract/route";
import type { Candidate, SearchResult } from "@/lib/types";
import { normName, type SideData } from "./data";
import { buildEvidence, type EvidenceCol } from "./evidence";
import { Badge, Icon, Inferred, SOURCE, SourceGlyph } from "./ui";

/** 결과 맨 위: 무엇을 얼마나 뒤졌는지 + 상위 후보 근거 지도 */
export function ResultsSummary({ result, top, side }: { result: SearchResult; top: Candidate[]; side: SideData }) {
  const { stats, normalized } = result;
  return (
    <section aria-labelledby="summary-title" className="animate-rise">
      <h2 id="summary-title" className="sr-only">
        결과 요약
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        <Stat label="읽은 한국 소속 논문" value={stats.papers.toLocaleString()} unit="편" />
        <Stat label="책임저자" value={stats.authors.toLocaleString()} unit="명" />
        <Stat label="점수를 매긴 후보" value={String(result.candidates.length)} unit="명" />
        <Stat label="걸린 시간" value={(stats.ms / 1000).toFixed(1)} unit="초" />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-medium text-ink-3">확인한 요구 항목</span>
        {normalized.items.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink">
            <span className="text-ink-3">{i.kind === "method" ? "방법" : "장비"}</span>
            <span className="font-medium">{i.label}</span>
            {i.inferred && <Inferred />}
          </span>
        ))}
      </div>

      {top.length > 0 && <EvidenceMap top={top} side={side} labels={normalized.items.map((i) => i.label)} />}
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-mono text-xl font-medium tabular text-ink">
        {value}
        <span className="ml-0.5 font-sans text-xs text-ink-3">{unit}</span>
      </dd>
    </div>
  );
}

const MAP_COLS: EvidenceCol[] = ["paper", "lab", "zeusInst", "zeusPi"];

/**
 * 상위 후보 × 요구 항목 근거 지도. 칸마다 "근거가 나온 출처"만 글자 상자로 찍는다.
 * 빈칸은 근거 없음 — 연구를 못 한다는 뜻이 아니라 공개 자료에서 못 찾았다는 뜻.
 */
function EvidenceMap({ top, side, labels }: { top: Candidate[]; side: SideData; labels: string[] }) {
  const labs = side.labs.state === "ok" && side.labs.data.status === "ok" ? side.labs.data : null;
  const eq = side.equip.state === "ok" ? side.equip.data : null;
  const proj = side.projects.state === "ok" ? side.projects.data : null;
  const loadingAny = [side.labs, side.equip, side.projects].some((a) => a.state === "loading");

  return (
    <div className="mt-6 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-lg font-bold text-ink">상위 후보 근거 지도</h3>
        {loadingAny && <span className="animate-blink text-xs text-ink-3">출처를 더 확인하는 중…</span>}
      </div>
      <p className="mt-1 text-xs leading-5 text-ink-3">
        칸에 찍힌 글자는 그 요구 항목을 뒷받침하는 출처입니다. 빈칸은 공개 자료에서 근거를 못 찾았다는 뜻이지, 못 한다는 뜻은 아닙니다.
      </p>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <caption className="sr-only">상위 후보별 요구 항목 근거 출처</caption>
          <thead>
            <tr className="border-b border-ink/80 text-left text-xs text-ink-3">
              <th scope="col" className="py-2 pr-3 font-medium">후보</th>
              {labels.map((l) => (
                <th key={l} scope="col" className="px-2 py-2 text-center font-medium">
                  {l}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 text-center font-medium">
                국가과제
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((c, i) => {
              const t = buildEvidence({
                items: c.items,
                lab: { async: side.labs, page: labs?.byCandidate[c.authorId], enabled: !!labs },
                inst: { async: side.equip, data: eq?.byInstitution[c.institutionId] },
                pi: { async: side.equip, data: eq?.byCandidate?.[c.authorId], enabled: !!eq?.byCandidate },
              });
              const nProj = proj?.byCandidate[c.authorId]?.length ?? 0;
              return (
                <tr key={c.authorId} className="border-b border-line/70 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <a href={`#cand-${c.authorId}`} className="group flex items-baseline gap-2">
                      <span className="font-serif font-bold text-primary/80 tabular">{i + 1}</span>
                      <span className="font-medium text-ink group-hover:text-primary group-hover:underline">{c.name}</span>
                    </a>
                    <span className="block pl-5 text-[11px] text-ink-3">
                      주제 {c.fit} · 방법 {c.methodFit}
                    </span>
                  </th>
                  {labels.map((l) => {
                    const row = t.rows.find((r) => r.item.label === l);
                    const hits = MAP_COLS.filter((col) => row?.cells[col]?.s === "yes");
                    return (
                      <td key={l} className="px-2 py-2 text-center">
                        {hits.length ? (
                          <span className="inline-flex gap-0.5" title={hits.map((h) => SOURCE[h].label).join(", ")}>
                            {hits.map((h) => (
                              <SourceGlyph key={h} source={h} />
                            ))}
                            <span className="sr-only">{hits.map((h) => SOURCE[h].label).join(", ")}에서 근거</span>
                          </span>
                        ) : (
                          <span className="text-line-strong">
                            –<span className="sr-only">근거 못 찾음</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center">
                    {side.projects.state === "loading" ? (
                      <span className="inline-block size-2 animate-blink rounded-full bg-ink-3/50" />
                    ) : proj ? (
                      nProj ? (
                        <span className="inline-flex items-center gap-1">
                          <SourceGlyph source="ntis" />
                          <span className="font-mono text-xs tabular text-ink">{nProj}</span>
                        </span>
                      ) : (
                        <span className="text-line-strong">–</span>
                      )
                    ) : (
                      <span className="text-xs text-ink-3">?</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="범례">
        {(["paper", "lab", "zeusInst", "zeusPi", "ntis"] as const).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <SourceGlyph source={s} />
            {SOURCE[s].label}
            {s === "zeusInst" && <Badge tone="zeus">기관 전체 기준</Badge>}
            {s === "lab" && labs === null && side.labs.state !== "loading" && <span className="text-ink-3">(이번엔 확인 안 함)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 제안서에 적힌 연락 예정 교수가 결과에 있는지 (이름 표기 차이를 고려해 성·이름 순서 둘 다 비교) */
export function AdvisorCheck({ advisor, result }: { advisor: NonNullable<Extracted["planned_advisor"]>; result: SearchResult }) {
  const en = advisor.name_en.trim().split(/\s+/);
  const variants = new Set([normName(advisor.name), normName(en.join("")), normName([...en.slice(-1), ...en.slice(0, -1)].join(""))]);
  const main = result.candidates.findIndex((c) => variants.has(normName(c.name)));
  const dom = result.domestic.candidates.findIndex((c) => variants.has(normName(c.name)) || (c.nameEn && variants.has(normName(c.nameEn))));
  const found = main >= 0 ? `전체 ${main + 1}위${main >= 5 ? ", 상위 5명 밖" : ""}` : dom >= 0 ? `국내 학술지 후보 ${dom + 1}위` : null;
  const href = main >= 0 ? `#cand-${result.candidates[main].authorId}` : dom >= 0 ? `#dom-${result.domestic.candidates[dom].ancId}` : null;
  return (
    <div
      className={`mt-6 flex gap-3 rounded-xl border p-4 text-sm leading-6 ${
        found ? "border-ok/30 bg-ok-soft text-ink" : "border-line bg-sunken text-ink-2"
      }`}
    >
      <Icon name={found ? "check" : "info"} className={`mt-1 size-4 ${found ? "text-ok" : "text-ink-3"}`} />
      <p>
        <span className="text-xs font-medium text-ink-3">제안서의 연락 예정 교수</span>
        <br />
        <b className="text-ink">{advisor.name}</b> ({advisor.affiliation}) —{" "}
        {found ? (
          <>
            결과에 있습니다 ({found}).{" "}
            {href && (
              <a href={href} className="font-medium text-primary underline">
                카드로 이동
              </a>
            )}
          </>
        ) : (
          "상위 15명 안에는 없습니다. 논문 데이터로는 잡히지 않는 연결(학교 협력, 지인 소개 등)로 고른 교수일 수 있습니다."
        )}
      </p>
    </div>
  );
}
