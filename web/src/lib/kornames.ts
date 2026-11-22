/**
 * 한글 이름 ↔ 영문 표기 이름 비교, OpenAlex 기관의 한국어 이름 조회.
 *
 * NTIS·ZEUS는 한글 이름만, OpenAlex는 영문 이름만 준다. 같은 기관 안에서 비교할 때만 쓴다
 * (기관이 같고 이름 표기가 맞으면 같은 사람일 가능성이 높다. 기관 없이 이름만으로는 판정하지 않는다).
 */

const INITIALS: string[][] = [
  ["g", "k"], ["kk", "gg", "k"], ["n"], ["d", "t"], ["tt", "dd"], ["r", "l", "n"], ["m"], ["b", "p"], ["pp", "bb"],
  ["s", "sh"], ["ss", "s"], [""], ["j", "ch"], ["jj", "j"], ["ch"], ["k"], ["t"], ["p"], ["h"],
];
const MEDIALS: string[][] = [
  ["a"], ["ae", "ai"], ["ya"], ["yae"], ["eo", "u", "o"], ["e"], ["yeo", "yu", "yo", "you"], ["ye"], ["o", "oh"],
  ["wa"], ["wae"], ["oe", "oi", "we"], ["yo"], ["u", "oo", "woo"], ["wo"], ["we"], ["wi"], ["yu", "yoo"],
  ["eu", "u", "ue"], ["ui", "ee", "i", "eui"], ["i", "ee"],
];
const FINALS: string[][] = [
  [""], ["k", "g"], ["k"], ["k"], ["n"], ["n"], ["n"], ["t", "d"], ["l", "r"], ["k"], ["m"], ["l"], ["l"], ["l"], ["p"],
  ["l"], ["m"], ["p", "b"], ["p"], ["t", "s"], ["t"], ["ng"], ["t"], ["t"], ["k"], ["t"], ["p"], ["t"],
];

// 성은 관용 표기가 정해진 경우가 많다
const SURNAMES: Record<string, string[]> = {
  김: ["kim", "gim"], 이: ["lee", "yi", "rhee", "i", "ri", "rhie"], 박: ["park", "pak", "bak"], 최: ["choi", "choe", "chey"],
  정: ["jung", "jeong", "chung", "cheong", "joung"], 조: ["cho", "jo", "joe"], 강: ["kang", "gang"], 윤: ["yoon", "yun", "youn"],
  장: ["jang", "chang"], 임: ["lim", "im", "yim", "rim"], 한: ["han"], 오: ["oh", "o"], 서: ["seo", "suh", "so", "seoh"],
  신: ["shin", "sin"], 권: ["kwon", "gwon"], 황: ["hwang"], 안: ["ahn", "an"], 송: ["song"], 전: ["jeon", "jun", "chun", "jeun"],
  홍: ["hong"], 유: ["yoo", "yu", "ryu"], 류: ["ryu", "yoo", "yu", "lyu"], 고: ["ko", "go"], 문: ["moon", "mun"],
  양: ["yang"], 손: ["son", "sohn"], 배: ["bae", "pae"], 백: ["baek", "paek", "back", "baik"], 허: ["heo", "huh", "hur"],
  남: ["nam"], 노: ["noh", "no", "roh"], 하: ["ha"], 곽: ["kwak", "gwak"], 성: ["sung", "seong"], 차: ["cha"],
  주: ["joo", "ju", "chu"], 우: ["woo", "wu"], 구: ["koo", "gu", "ku"], 민: ["min"], 진: ["jin", "chin"], 나: ["na", "ra"],
  염: ["yeom", "yum"], 여: ["yeo", "yuh"], 변: ["byun", "byeon"], 엄: ["eom", "um", "uhm"], 원: ["won"], 천: ["cheon", "chun"],
  방: ["bang", "pang"], 공: ["kong", "gong"], 현: ["hyun", "hyeon"], 함: ["ham"], 석: ["seok", "suk"], 설: ["seol", "sul"],
};

function syllableVariants(ch: string): string[] {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return [ch.toLowerCase()];
  const ini = INITIALS[Math.floor(code / 588)];
  const med = MEDIALS[Math.floor((code % 588) / 28)];
  const fin = FINALS[code % 28];
  const out = new Set<string>();
  for (const i of ini) for (const m of med) for (const f of fin) out.add(i + m + f);
  // 관용 표기 보강: 영(yeong→young/yung), 성(seong→sung), 형(hyeong→hyung) 등
  for (const v of [...out]) {
    out.add(v.replace(/eong$/, "ung").replace(/yeong$/, "young"));
    out.add(v.replace(/eon$/, "un"));
  }
  return [...out];
}

function letters(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
}

/** 영문 이름 토큰 목록이 한글 이름(이름 부분)과 맞는가. 한 글자 토큰은 이니셜로 본다 */
function givenMatches(givenKo: string, tokens: string[]): boolean {
  const syl = [...givenKo].map(syllableVariants);
  if (tokens.length === syl.length) {
    return tokens.every((t, i) => (t.length === 1 ? syl[i].some((v) => v.startsWith(t)) : syl[i].includes(t)));
  }
  // "Kyungchun", "Kyung-Chun" 같이 붙여 쓴 경우: 음절 변형을 이어 붙여 비교
  const joined = tokens.join("");
  let partial = [""];
  for (const vs of syl) {
    partial = partial.flatMap((p) => vs.map((v) => p + v)).filter((p) => joined.startsWith(p));
    if (partial.length === 0) return false;
  }
  return partial.includes(joined);
}

/**
 * 한글 이름(예: 김경천)과 영문 이름(예: "Kyung Chun Kim", "Kim, Kyung-Chun", "K. C. Kim")이 같은 사람 표기일 수 있는가.
 * 2~4글자 한글 이름만. 두 글자 성(남궁 등)은 첫 글자만 성으로 본다.
 */
export function koreanNameMatches(ko: string, en: string): boolean {
  const name = ko.replace(/\s/g, "");
  if (!/^[가-힣]{2,4}$/.test(name)) return false;
  const tokens = en.split(/[\s,.\-‐]+/).map(letters).filter(Boolean);
  if (tokens.length < 2) return false;
  const surname = SURNAMES[name[0]] ?? syllableVariants(name[0]);
  const given = name.slice(1);
  // 성이 맨 앞 또는 맨 뒤
  if (surname.includes(tokens[tokens.length - 1]) && givenMatches(given, tokens.slice(0, -1))) return true;
  if (surname.includes(tokens[0]) && givenMatches(given, tokens.slice(1))) return true;
  return false;
}

/** 기관명 비교용: "재단법인", "(주)", "산학협력단", 공백 등을 뗀다 */
export function normOrgan(s: string): string {
  return s
    .replace(/\(재\)|\(주\)|\(사\)|재단법인|사단법인|주식회사|산학협력단|산학협력기관|국립/g, "")
    .replace(/\([^)]*\)/g, "") // "군산대학교(소룡)" 같은 캠퍼스 표기
    .replace(/[\s·.()]/g, "")
    .trim();
}

export function sameOrgan(a: string, b: string): boolean {
  const x = normOrgan(a);
  const y = normOrgan(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

const koNameCache = new Map<string, string | null>();

/** OpenAlex 기관의 다른 이름 중 한글이 들어간 것 (예: Seoul National University → 서울대학교) */
export async function koreanInstitutionNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const need = [...new Set(ids)].filter((id) => id && !koNameCache.has(id));
  for (let i = 0; i < need.length; i += 50) {
    try {
      const params = new URLSearchParams({
        filter: `id:${need.slice(i, i + 50).join("|")}`,
        select: "id,display_name_alternatives",
        per_page: "50",
      });
      if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
      const res = await fetch(`https://api.openalex.org/institutions?${params}`, { signal: AbortSignal.timeout(10000) });
      const data = (await res.json()) as { results: { id: string; display_name_alternatives: string[] }[] };
      for (const r of data.results ?? []) {
        const ko = r.display_name_alternatives?.find((n) => /[가-힣]/.test(n)) ?? null;
        koNameCache.set(r.id.replace("https://openalex.org/", ""), ko);
      }
    } catch {
      // 기관명 매칭만 빠진다
    }
  }
  for (const id of ids) {
    const ko = koNameCache.get(id);
    if (ko) out.set(id, ko);
  }
  return out;
}
