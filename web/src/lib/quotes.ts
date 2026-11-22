/** 인용 검사: 모델이 고른 구절이 원문에 실제로 있는지 코드로 확인한다 (문장을 만들어내지 않기 위해) */

export const normQuote = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** 인용이 원문에 그대로 있는지 (공백·따옴표·대시 표기, 대소문자, 끝 마침표 차이는 허용) */
export function quoteInSource(quote: string, source: string): boolean {
  const q = normQuote(quote).replace(/^["']|["'.,;:]+$/g, "");
  return q.split(" ").length >= 4 && normQuote(source).includes(q);
}
