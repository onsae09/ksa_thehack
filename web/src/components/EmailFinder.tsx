"use client";

import { useState } from "react";
import type { EmailResult } from "@/app/api/email/route";
import { Badge, ExtLink, Icon, InlineLoading } from "./ui";

/** 누를 때만 공개 웹페이지에서 이메일을 찾는다 (출처 페이지에서 직접 확인했는지 함께 표시) */
export function EmailFinder({ name, institution, hint }: { name: string; institution: string; hint: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [r, setR] = useState<EmailResult | null>(null);

  async function find() {
    setState("loading");
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, institution, hint }),
      });
      if (!res.ok) throw new Error();
      setR(await res.json());
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "idle" || state === "error") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={find}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          <Icon name="mail" className="size-3.5" />
          {state === "error" ? "이메일 다시 찾기" : "이메일 찾기"}
        </button>
        {state === "error" && <span className="text-xs text-danger">이메일 검색에 실패했습니다.</span>}
      </span>
    );
  }
  if (state === "loading") return <InlineLoading>공개 웹페이지에서 찾는 중 (10~20초)</InlineLoading>;
  if (!r?.email) return <span className="text-xs text-ink-3">공개 페이지에서 이메일을 찾지 못했습니다.</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a className="font-mono text-sm text-primary underline" href={`mailto:${r.email}`}>
        {r.email}
      </a>
      {r.verified ? (
        <Badge tone="ok" icon="check">출처 페이지에서 확인됨</Badge>
      ) : (
        <Badge tone="warn" icon="alert">자동 확인 실패 · 출처에서 직접 확인 필요</Badge>
      )}
      {r.source && (
        <ExtLink href={r.source} quiet className="text-xs">
          출처
        </ExtLink>
      )}
    </span>
  );
}
