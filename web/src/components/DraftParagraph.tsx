"use client";

import { useState } from "react";
import { Check, Copy, FileText, Loader2, TriangleAlert } from "lucide-react";
import type { DraftResult, DraftSource } from "@/app/api/draft/route";
import type { Candidate, DomesticCandidate } from "@/lib/types";

/** OpenAlex 후보와 국내(DBpia) 후보 둘 다 받는다. DBpia는 소속을 공개하지 않아 institution이 없다 */
type DraftTarget = Pick<Candidate, "name" | "topPapers" | "items"> & { institution?: string };
import { Button } from "@/components/ui/button";

/** 후보의 논문 초록·근거 문장 → 인용 후보 원문 (같은 논문은 하나로) */
export function draftSources(c: DraftTarget): DraftSource[] {
  const out = new Map<string, DraftSource>();
  for (const p of c.topPapers) out.set(p.url, { title: p.title, url: p.url, text: p.abstract });
  for (const it of c.items) {
    const e = it.evidence;
    if (!e) continue;
    const prev = out.get(e.url);
    // 근거 문장이 잘린 초록(600자) 밖에 있을 수 있어 덧붙인다
    if (prev) {
      if (!prev.text.includes(e.sentence)) prev.text += ` ${e.sentence}`;
    } else out.set(e.url, { title: e.paperTitle, url: e.url, text: e.sentence });
  }
  return [...out.values()];
}

/**
 * 메일 첫 문단 초안. 누를 때만 만든다.
 * koName: 연구실 페이지에서 확인한 한글 이름이 있으면 받는 사람 이름으로 쓴다.
 * 인용은 서버가 원문에 그대로 있는지 확인한 것만 들어간다 (확인 못 한 인용은 빼고 개수만 알린다).
 */
export function DraftParagraph({ c, question, koName }: { c: DraftTarget | DomesticCandidate; question: string; koName?: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [r, setR] = useState<DraftResult | null>(null);
  const [copied, setCopied] = useState(false);
  const sources = draftSources(c);

  async function make() {
    setState("loading");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, name: c.name, displayName: koName ?? undefined, institution: "institution" in c ? c.institution : "", sources }),
      });
      if (!res.ok) throw new Error();
      setR(await res.json());
      setState("done");
    } catch {
      setState("error");
    }
  }

  async function copy() {
    if (!r) return;
    await navigator.clipboard.writeText(r.paragraph);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (sources.length === 0) return null;

  if (state !== "done" || !r) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={make} disabled={state === "loading"}>
          {state === "loading" ? <Loader2 className="animate-spin" /> : <FileText />}
          {state === "loading" ? "초안 쓰는 중 (5~15초)" : state === "error" ? "메일 첫 문단 다시 만들기" : "메일 첫 문단 만들기"}
        </Button>
        {state === "error" && <span className="text-xs text-destructive">초안 작성에 실패했습니다.</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">메일 첫 문단 초안</span>
        <Button type="button" variant="ghost" size="xs" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "복사됨" : "복사"}
        </Button>
      </div>
      <p className="text-[13px] leading-6 whitespace-pre-wrap text-foreground">{r.paragraph}</p>
      <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
        {r.quotes.map((q) => (
          <li key={q.quote} className="flex gap-1.5">
            <Check className="mt-0.5 size-3 shrink-0 text-ok" aria-label="원문 확인됨" />
            <span>
              인용 원문 확인:{" "}
              <a href={q.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {q.title}
              </a>
            </span>
          </li>
        ))}
        {r.dropped > 0 && (
          <li className="flex gap-1.5 text-warn">
            <TriangleAlert className="mt-0.5 size-3 shrink-0" />
            원문에서 확인되지 않은 인용 {r.dropped}개는 뺐습니다.
          </li>
        )}
        <li>[이름]·[학교]를 채우고, 인용한 논문은 직접 읽은 뒤 보내세요.</li>
      </ul>
    </div>
  );
}
