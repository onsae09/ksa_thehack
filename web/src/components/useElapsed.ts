import { useEffect, useRef, useState } from "react";

/** 이 훅을 쓰는 컴포넌트가 화면에 나온 뒤 지난 시간(초). 진행 표시 전용 */
export function useElapsed(tickMs = 250): number {
  const start = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    start.current = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - start.current) / 1000), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return elapsed;
}
