type Level = "높음" | "중간" | "낮음";

const N: Record<Level, number> = { 낮음: 1, 중간: 2, 높음: 3 };
const FILL: Record<Level, string> = { 높음: "bg-primary", 중간: "bg-primary/55", 낮음: "bg-ink-3/45" };

const HELP =
  "가장 가까운 논문 한 편의 유사도로 정한 등급입니다 (0.55 이상 높음, 0.45 이상 중간). 옆 숫자는 순위에 쓰는 점수로, 2·3번째 논문을 조금 더한 값입니다.";

/**
 * 3칸 등급 막대. 등급은 데이터의 라벨을 그대로 쓰고, 막대 길이로 점수를 꾸며내지 않는다.
 */
export function FitMeter({ label, level, score }: { label: string; level: Level; score: number }) {
  const n = N[level] ?? 1;
  return (
    <div className="flex items-center gap-2" title={HELP}>
      <span className="w-7 text-xs font-medium text-ink-3">{label}</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2 w-5 rounded-[2px] ${i <= n ? FILL[level] : "bg-sunken ring-1 ring-inset ring-line"}`} />
        ))}
      </span>
      <span className="text-xs font-semibold text-ink">{level}</span>
      <span className="font-mono text-[11px] tabular text-ink-3">{score.toFixed(2)}</span>
      <span className="sr-only">
        {label} 적합도 {level}, 점수 {score.toFixed(2)}
      </span>
    </div>
  );
}

export function FitMeters({ c }: { c: { fit: Level; T: number; methodFit: Level; M: number } }) {
  return (
    <div className="space-y-1">
      <FitMeter label="주제" level={c.fit} score={c.T} />
      <FitMeter label="방법" level={c.methodFit} score={c.M} />
    </div>
  );
}
