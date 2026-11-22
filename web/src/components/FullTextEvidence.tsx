"use client";

import { useEffect, useRef, useState } from "react";
import { FileSearch, FileText, FileX2 } from "lucide-react";
import type { FullTextPaper, FullTextProgress, FullTextResult } from "@/lib/fulltext";
import type { CheckItem, ItemResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Caveat, ExtLink, Flag, Highlight, InlineLoading, Quiet } from "./marks";

type Paper = { id: string; title: string; url: string };

type State =
  | { s: "idle" }
  | { s: "loading"; progress: FullTextProgress | null }
  | { s: "done"; r: FullTextResult }
  | { s: "failed" };

// 같은 후보를 다시 열면 다시 내려받지 않는다 (서버도 캐시하지만 왕복을 아낀다)
const memo = new Map<string, FullTextResult>();
const memoKey = (authorId: string, items: CheckItem[]) => `${authorId}|${items.map((i) => i.label).join(",")}`;

/**
 * 논문 본문에서 확인: 후보의 가까운 논문 중 공개(오픈액세스) PDF가 있는 것만 읽어 필요한 방법·장비가 적힌 원문 문장을 보여준다.
 * auto면 열자마자 확인하고(상위 후보), 아니면 버튼을 눌러야 내려받는다.
 */
export function FullTextEvidence({
  authorId,
  papers,
  items,
  abstractItems,
  auto,
}: {
  authorId: string;
  papers: Paper[];
  items: CheckItem[] | undefined;
  abstractItems: ItemResult[];
  auto: boolean;
}) {
  const key = items ? memoKey(authorId, items) : "";
  const [state, setState] = useState<State>(() => {
    const hit = memo.get(key);
    if (hit) return { s: "done", r: hit };
    return auto && items?.length ? { s: "loading", progress: null } : { s: "idle" };
  });
  const started = useRef(false);

  const run = async () => {
    if (!items?.length) return;
    started.current = true;
    setState({ s: "loading", progress: null });
    try {
      const res = await fetch("/api/fulltext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId,
          papers: papers.map((p) => ({ id: p.id, title: p.title, url: p.url })),
          items: items.map((i) => ({ label: i.label, keywords_en: i.keywords_en, keywords_ko: i.keywords_ko })),
          stream: true,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as ({ type: "progress" } & FullTextProgress) | { type: "result"; result: FullTextResult };
          if (msg.type === "progress") {
            setState({ s: "loading", progress: msg });
          } else {
            memo.set(memoKey(authorId, items), msg.result);
            setState({ s: "done", r: msg.result });
            return;
          }
        }
      }
      throw new Error("결과 없음");
    } catch {
      setState({ s: "failed" });
    }
  };

  useEffect(() => {
    if (auto && state.s === "loading" && !started.current) void run();
    // 처음 열 때 한 번만 (후보가 바뀌면 부모가 key로 새로 만든다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items?.length) return null;

  if (state.s === "idle") {
    return (
      <div className="space-y-3">
        <p className="text-xs leading-5 text-muted-foreground">
          초록에는 없고 실험 방법 절에만 적힌 장비·방법이 있을 수 있습니다. 가까운 논문 중 공개(오픈액세스) PDF가 있는 것을 최대 3편 읽어 확인합니다.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={run}>
          <FileSearch aria-hidden="true" />
          본문 확인하기
        </Button>
      </div>
    );
  }

  if (state.s === "loading") return <InlineLoading>{progressText(state.progress, papers.length)}</InlineLoading>;

  if (state.s === "failed") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">본문 확인에 실패했습니다.</p>
        <Button type="button" variant="outline" size="sm" onClick={run}>
          <FileSearch aria-hidden="true" />
          다시 확인하기
        </Button>
      </div>
    );
  }

  const r = state.r;
  const checked = r.papers.filter((p) => p.status === "checked");
  const abstractHas = new Map(abstractItems.map((i) => [i.label, !!i.evidence]));

  if (checked.length === 0) {
    return (
      <div className="space-y-3">
        <Quiet icon={FileX2}>
          본문을 확인할 수 있는 공개 PDF가 없음
          <span className="block text-xs leading-5">
            {r.papers.some((p) => p.status !== "no_pdf")
              ? "공개 사본은 있었지만 내려받거나 읽지 못했습니다. 논문 링크에서 직접 확인하세요."
              : "가까운 논문이 모두 구독 전용입니다. 학교 도서관이나 저자에게 받은 원문으로 확인하세요."}
          </span>
        </Quiet>
        <PaperStatusList papers={r.papers} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {r.items.map((it) => {
          const inAbstract = abstractHas.get(it.label) ?? false;
          const h = it.hit;
          return (
            <li key={it.label}>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-foreground">{it.label}</span>
                {h && !inAbstract && (
                  <Flag tone="ok" title="초록에서는 찾지 못했고 본문에서만 찾은 근거입니다">
                    초록에 없던 근거
                  </Flag>
                )}
                {h?.inMethods && <Flag title="논문의 실험·방법 절(Methods/Experimental) 안의 문장입니다">방법 절</Flag>}
              </div>
              {h ? (
                <>
                  <blockquote className="border-l-2 border-src-paper/35 pl-3.5 font-serif text-[14px] leading-7 text-foreground/85">
                    “<Highlight text={h.sentence} term={h.matched} />”
                  </blockquote>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 pl-3.5 text-xs leading-5 text-muted-foreground">
                    <span className="tabular">본문 p.{h.page}</span>
                    <span aria-hidden="true">·</span>
                    <ExtLink href={h.url} quiet className="min-w-0 max-w-[28rem] truncate">
                      {h.paperTitle || "논문"}
                    </ExtLink>
                    <span aria-hidden="true">·</span>
                    <ExtLink href={h.pdfUrl} quiet>
                      PDF
                    </ExtLink>
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {inAbstract ? "본문에서는 찾지 못함 (초록에는 있음)" : "본문에서도 찾지 못함"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <PaperStatusList papers={r.papers} />
      <Caveat>
        키워드가 든 원문 문장을 그대로 옮긴 것으로, 문장을 새로 쓰지 않았습니다. 장비를 이 연구실이 직접 썼는지는 PDF에서 앞뒤 문맥을 확인하세요.
      </Caveat>
    </div>
  );
}

function progressText(p: FullTextProgress | null, n: number): string {
  if (!p || p.stage === "lookup") return `논문 ${Math.min(n, 3)}편의 공개 PDF 찾는 중`;
  if (p.pdfs === 0) return "공개 PDF가 있는 논문이 없습니다";
  // 여러 편을 함께 읽으므로 "몇 번째 읽는 중"이 아니라 끝낸 수를 보여준다
  return p.done === 0 ? `오픈액세스 PDF ${p.pdfs}편 읽는 중` : `오픈액세스 PDF ${p.pdfs}편 중 ${p.done}편 읽음, 나머지 읽는 중`;
}

const STATUS: Record<FullTextPaper["status"], { label: string; tone: string }> = {
  checked: { label: "읽음", tone: "text-ok" },
  no_pdf: { label: "공개 PDF 없음", tone: "text-muted-foreground" },
  download_failed: { label: "내려받기 실패", tone: "text-warn" },
  parse_failed: { label: "읽기 실패", tone: "text-warn" },
};

/** 어떤 논문을 읽었고 어떤 논문은 못 읽었는지 (정직하게) */
function PaperStatusList({ papers }: { papers: FullTextPaper[] }) {
  if (papers.length === 0) return null;
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2.5">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">확인한 논문 {papers.length}편</p>
      <ul className="space-y-1">
        {papers.map((p) => {
          const st = STATUS[p.status];
          return (
            <li key={p.id} className="flex items-baseline gap-2 text-xs leading-5">
              <FileText className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden="true" />
              <ExtLink href={p.url} quiet className="min-w-0 flex-1 truncate">
                {p.title || p.id}
              </ExtLink>
              <span className={cn("shrink-0 whitespace-nowrap", st.tone)} title={p.detail ?? undefined}>
                {st.label}
                {p.status === "checked" && p.pages ? <span className="text-muted-foreground tabular"> · {p.pages}쪽</span> : null}
                {p.detail && p.status !== "no_pdf" ? <span className="sr-only"> ({p.detail})</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
