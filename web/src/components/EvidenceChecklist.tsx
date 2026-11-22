import type { ItemResult } from "@/lib/types";
import type { Cell, EvidenceTable } from "./evidence";
import { ExtLink, Highlight, Icon, Inferred, SOURCE, SourceGlyph } from "./ui";

/**
 * 요구 항목 × 출처 근거표. 학생이 "어떤 요구가 어떤 출처로 뒷받침되는지" 한눈에 보게 한다.
 * 칸 상태는 기호 + 글(스크린리더)로 같이 전한다.
 */
export function EvidenceChecklist({ table, caption }: { table: EvidenceTable; caption: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[18rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="py-2 pr-2 text-xs font-medium text-ink-3">
              필요한 것
            </th>
            {table.cols.map((c) => (
              <th key={c} scope="col" className="w-14 px-1 py-2 text-center align-bottom sm:w-20" title={SOURCE[c].label}>
                <span className="flex flex-col items-center gap-1">
                  <SourceGlyph source={c} />
                  <span className="text-[11px] leading-3 font-medium text-ink-3">{SOURCE[c].short}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.item.label} className="border-b border-line/70 last:border-0">
              <th scope="row" className="py-2 pr-2 text-left font-normal">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-ink">{r.item.label}</span>
                  <span className="text-[11px] text-ink-3">{r.item.kind === "method" ? "방법" : "장비"}</span>
                  {r.item.inferred && <Inferred />}
                </span>
              </th>
              {table.cols.map((c) => (
                <td key={c} className="px-1 py-2 text-center">
                  <CellMark cell={r.cells[c]} source={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellMark({ cell, source }: { cell: Cell | undefined; source: keyof typeof SOURCE }) {
  if (!cell || cell.s === "na") {
    return (
      <span className="text-xs text-line-strong" title="해당 없음">
        ·<span className="sr-only">해당 없음</span>
      </span>
    );
  }
  if (cell.s === "loading") {
    return (
      <span className="inline-block size-2 animate-blink rounded-full bg-ink-3/50" title="불러오는 중">
        <span className="sr-only">불러오는 중</span>
      </span>
    );
  }
  if (cell.s === "no") {
    return (
      <span className="inline-grid size-6 place-items-center text-ink-3/70" title={cell.note}>
        <Icon name="dash" className="size-4" />
        <span className="sr-only">근거 없음: {cell.note}</span>
      </span>
    );
  }
  const mark = (
    <span className={`inline-grid size-6 place-items-center rounded-full ${SOURCE[source].cls}`}>
      <Icon name="check" className="size-3.5" />
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
export function EvidenceQuotes({ items, quiet = false }: { items: ItemResult[]; quiet?: boolean }) {
  const withEv = items.filter((i) => i.evidence);
  if (withEv.length === 0) {
    if (quiet) return null; // 카드 경고 문구가 같은 내용을 이미 말한다
    return <p className="text-xs text-ink-3">초록에서 방법·장비가 적힌 문장을 찾지 못했습니다.</p>;
  }
  return (
    <ul className="space-y-3">
      {withEv.map((it) => {
        const ev = it.evidence!;
        return (
          <li key={it.label}>
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
              <SourceGlyph source="paper" />
              <span className="font-semibold text-ink">{it.label}</span>
              {!ev.onTopic && (
                <span className="text-ink-3" title="이 주제로 검색된 논문이 아니라, 같은 연구자의 다른 논문에서 찾은 문장입니다">
                  · 다른 주제 논문
                </span>
              )}
            </div>
            <blockquote className="border-l-2 border-src-paper/40 pl-3 text-[13px] leading-6 text-ink-2">
              “<Highlight text={ev.sentence} term={ev.matched} />”
              <footer className="mt-0.5 text-xs">
                <ExtLink href={ev.url} quiet>
                  {ev.paperTitle || "원문 보기"}
                </ExtLink>
              </footer>
            </blockquote>
          </li>
        );
      })}
    </ul>
  );
}
