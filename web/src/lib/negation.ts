/**
 * 근거 문장의 부정·가정 문맥 판정 (초록 findEvidence, 본문 fulltext, 국내 초록이 같은 규칙을 쓴다).
 *
 * 키워드가 들어 있어도 "이 연구실이 그 방법을 썼다"는 뜻이 아닌 문장이 있다.
 * - 앞쪽 부정: "no experiment has…", "without simulation", "instead of holography"
 * - 뒤쪽 부정: "such an experimental setup could not be obtained", "simulations were not performed"
 * - 가정·제안: "this can occur by using an SLM", "could be applied to holography", "in future work"
 * 뒤쪽은 같은 절(쉼표+접속사, 세미콜론, 문장 끝까지) 안에서만 본다. 다음 절의 부정은 다른 이야기다
 * ("We performed experiments, but no damage was observed"에서 실험은 근거로 남는다).
 *
 * 이 파일은 다른 모듈을 import하지 않는다 (scripts/test-negation.mts가 node로 바로 돌린다).
 */

// 키워드 바로 앞 30자 안의 부정어 (기존 규칙)
// "not only A but also B"는 부정이 아니다
const BEFORE = /\b(no|not(?!\s+only)|without|never|lack of|lacking|absence of|instead of|rather than)\b[^.]*$/i;

// 키워드 뒤, 같은 절 안의 부정. "X does not require Y"처럼 X의 성질을 말하는 문장은 그대로 근거로 남기려고
// 부정 뒤에 "수행·획득·사용" 류 동사(또는 be)가 올 때만 본다
const DONE = String.raw`(?:be|been|yet|possible|feasible|available|performed|conducted|carried|done|used|employed|obtained|realized|implemented|measured|tested|verified|validated|attempted|included|considered|achieved|applied|built|constructed|perform|conduct|use|employ|obtain|measure|include|implement|realize|carry)`;
const AFTER = new RegExp(
  [
    String.raw`\b(?:could|can|would|will|did|does|do|was|were|is|are|has|have|had|may|might|should)\s*(?:not|n't)\s+(?:\w+ly\s+)?${DONE}\b`,
    String.raw`\bcannot\s+(?:\w+ly\s+)?${DONE}\b`,
    String.raw`\bnot\s+(?:be|been|yet)\b`,
    String.raw`\b(?:failed|fails|fail)\s+to\b`,
    String.raw`\bunable\s+to\b`,
    String.raw`\b(?:impossible|infeasible|unavailable|unfeasible|impractical)\b`,
    String.raw`\bno\b[^,;]{0,40}\b(?:was|were|is|are|has|have|been)\b`,
    String.raw`\b(?:was|were|is|are)\s+(?:absent|lacking|missing|beyond the scope)\b`,
    String.raw`\bbeyond the scope\b`,
    String.raw`\bremains? to be\b`,
  ].join("|"),
  "i",
);

// 가정·제안 (실제로 했다는 서술이 아님): 문장 어디에 있든
const HYPOTHETICAL_ANYWHERE = /\b(?:in (?:the )?future|future (?:work|stud(?:y|ies)|research|experiments?)|will be (?:the subject|addressed|investigated) in)\b/i;
// 키워드 앞의 가정 표현: "This can occur by using an SLM" (일어날 수 있다는 설명이지 썼다는 말이 아님)
const HYPOTHETICAL_BEFORE = /\bcan\s+(?:also\s+)?(?:occur|happen|arise)\b[^.;]*$/i;
// 키워드 뒤 같은 절의 가정 표현
const HYPOTHETICAL_AFTER = new RegExp(
  [
    String.raw`\bcan\s+(?:also\s+)?(?:occur|happen|arise)\b`,
    String.raw`\b(?:could|would|might)\s+(?:also\s+|potentially\s+|in principle\s+)?(?:be|enable|allow|serve|provide|offer|benefit|make)\b`,
    String.raw`\b(?:is|are)\s+(?:proposed|suggested|expected|envisioned|anticipated)\s+(?:to|as|for)\b`,
    String.raw`\bif\s+(?:one|we|it)\b`,
  ].join("|"),
  "i",
);

// 절 경계: 세미콜론·콜론, 또는 쉼표 뒤 접속사, 또는 접속사 단독
const CLAUSE_END = /;|:|,\s*(?:but|while|whereas|although|though|yet|however|and\s+(?:we|it|this|the|our|no))\b|\s(?:but|whereas|although|however)\s/i;

/** 키워드 뒤 같은 절(최대 160자) */
export function clauseAfter(sentence: string, end: number): string {
  const rest = sentence.slice(end, end + 160);
  const m = CLAUSE_END.exec(rest);
  return m ? rest.slice(0, m.index) : rest;
}

/** 키워드(sentence[start, end))가 부정·가정 문맥이면 true → 근거로 쓰지 않는다 */
export function negatedAt(sentence: string, start: number, end: number): boolean {
  if (BEFORE.test(sentence.slice(Math.max(0, start - 30), start))) return true;
  if (HYPOTHETICAL_ANYWHERE.test(sentence)) return true;
  if (HYPOTHETICAL_BEFORE.test(sentence.slice(Math.max(0, start - 60), start))) return true;
  const after = clauseAfter(sentence, end);
  return AFTER.test(after) || HYPOTHETICAL_AFTER.test(after);
}

/* ───────── 한국어 ───────── */

// 키워드 바로 뒤(4자 안): "실험 없이", "시뮬레이션 대신", "실험이 아닌"
const KO_IMMEDIATE = /^.{0,4}?(?:없이|대신|아닌|아니라|않은|없는)/;
// 같은 절 안의 서술어 부정: "수행하지 못했다", "확인되지 않았다", "할 수 없었다", "불가능하다"
const KO_CLAUSE = /(?:지\s*(?:않|못)|못\s*(?:했|하였|한다|함)|수\s*(?:가\s*)?없|불가능|이루어지지|어려워|어렵다|어려웠)/;
// 한국어 절 경계: 쉼표, 연결 어미 뒤 띄어쓰기
const KO_CLAUSE_END = /[,，;]|(?:지만|으나|는데|하고|하며|이며|으며|였고|었고|했고)\s/;
// 가정·향후 과제
const KO_HYPOTHETICAL = /(?:향후|추후|앞으로)\s*(?:연구|과제|실험|에는|에서)|할\s*수\s*있을\s*것|기대된다|제안한다/;

/** 한국어 문장에서 키워드(sentence[start, end))가 부정·가정 문맥이면 true */
export function negatedAtKo(sentence: string, start: number, end: number): boolean {
  const rest = sentence.slice(end, end + 40);
  if (KO_IMMEDIATE.test(rest)) return true;
  if (KO_HYPOTHETICAL.test(sentence)) return true;
  const m = KO_CLAUSE_END.exec(rest);
  const clause = m ? rest.slice(0, m.index) : rest;
  if (KO_CLAUSE.test(clause)) return true;
  // 영어로 쓴 국내 초록도 있다
  return /[A-Za-z]/.test(sentence.slice(start, end)) && negatedAt(sentence, start, end);
}
