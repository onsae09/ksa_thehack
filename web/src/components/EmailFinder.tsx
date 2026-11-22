"use client";

import { useState } from "react";
import { AlertTriangle, BadgeCheck, Mail } from "lucide-react";
import type { EmailResult } from "@/app/api/email/route";
import { Button } from "@/components/ui/button";
import { ExtLink, Flag, InlineLoading } from "./marks";

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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={find}>
          <Mail aria-hidden="true" />
          {state === "error" ? "이메일 다시 찾기" : "이메일 찾기"}
        </Button>
        {state === "error" ? (
          <span className="text-xs text-destructive">이메일 검색에 실패했습니다.</span>
        ) : (
          <span className="text-xs text-muted-foreground">공개 웹페이지에 적힌 주소만 찾습니다</span>
        )}
      </div>
    );
  }
  if (state === "loading") return <InlineLoading>공개 웹페이지에서 찾는 중 (10~20초)</InlineLoading>;
  if (!r?.email) return <p className="text-xs text-muted-foreground">공개 페이지에서 이메일을 찾지 못했습니다.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="font-mono text-sm text-primary underline underline-offset-[3px]" href={`mailto:${r.email}`}>
        {r.email}
      </a>
      {r.verified ? (
        <Flag tone="ok" icon={BadgeCheck}>
          출처 페이지에서 확인됨
        </Flag>
      ) : (
        <Flag tone="warn" icon={AlertTriangle}>
          자동 확인 실패 · 출처에서 직접 확인 필요
        </Flag>
      )}
      {r.source && (
        <ExtLink href={r.source} quiet className="text-xs">
          출처
        </ExtLink>
      )}
    </div>
  );
}
