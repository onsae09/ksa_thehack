/**
 * 축 하나(주제 또는 방법)의 점수: 가장 가까운 논문 1편(s1) 기준 + 2·3번째 논문 소폭 가산.
 * (상위 3편 평균은 덜 관련된 논문을 여러 편 쓴 사람을 과하게 우대했다)
 */
export function axisScore(sims: number[]): { s1: number; value: number } {
  const [s1 = 0, s2 = 0, s3 = 0] = [...sims].sort((a, b) => b - a);
  return { s1, value: s1 + 0.1 * s2 + 0.05 * s3 };
}

// s1 기준 라벨. 경계값은 예시 주제 몇 개의 분포를 보고 정한 임시값.
export function fitLabel(s1: number): "높음" | "중간" | "낮음" {
  if (s1 >= 0.55) return "높음";
  if (s1 >= 0.45) return "중간";
  return "낮음";
}

export const W_TOPIC = 0.5;
export const W_METHOD = 0.5;

export const round3 = (x: number) => Math.round(x * 1000) / 1000;
