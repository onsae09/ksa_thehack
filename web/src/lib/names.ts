/**
 * 이름으로 한국인 여부를 "추정"한다. 국적 데이터가 없어서 쓰는 근사치이며 틀릴 수 있다
 * (예: 한국계 외국 국적자, 한국 성과 표기가 같은 다른 나라 성). 화면에도 추정임을 표시한다.
 */
const KOREAN_SURNAMES = new Set(
  (
    "kim lee yi rhee park pak bak choi choe jung jeong chung kang cho jo yoon yun jang chang lim im lym " +
    "han oh seo suh shin sin kwon kwan hwang ahn an song yoo yu ryu hong jeon jun chun ko koh go moon mun yang son sohn " +
    "bae baek paik baik heo huh nam noh roh no ha kwak sung seong cha joo ju woo koo ku min na jin ji um eom " +
    "chae won cheon bang kong hyun ham byun byeon yeom yeo choo chu do seok sun seol ma gil pyo myung ki ban " +
    "jee jhee jeong rho ro yeon lyu uhm doh nho kyung tak " +
    // 같은 성의 다른 로마자 표기
    "hahn hahm shim sim yim chey joung youn kweon gwon hyeon jhun kho jeung choung chee pyun bong chong " +
    "jhung lew rew rhyu suk seoh yeum eum whang hwan kahng khang jahng cheong cheung chae chai"
  ).split(/\s+/),
);

export function isKoreanName(name: string): boolean {
  if (/[가-힣]/.test(name)) return true;
  const tokens = name
    .toLowerCase()
    .replace(/[‐‑–—]/g, "-")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (tokens.length < 2) return false;
  const first = tokens[0].replace(/[^a-z]/g, "");
  const last = tokens[tokens.length - 1].replace(/[^a-z]/g, "");
  return KOREAN_SURNAMES.has(last) || KOREAN_SURNAMES.has(first);
}

export type OrgKind = "university" | "institute";

/** OpenAlex 기관 유형 → 대학 / 연구소(출연연·국공립·비영리·병원) */
export function orgKind(institutionType: string): OrgKind {
  return institutionType === "education" ? "university" : "institute";
}
