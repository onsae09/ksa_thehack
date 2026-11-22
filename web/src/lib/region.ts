/**
 * 기관 → 시·도. OpenAlex 기관 기록의 geo(region·city)를 쓴다.
 * region 표기가 제각각이라("Gyeonggi-do", "North Chungcheong", "Jeollabuk-do") 정규식으로 맞추고,
 * region이 없으면 city로 한 번 더 본다. 둘 다 안 맞으면 null (필터에서 "지역 미상").
 */
const BASE = "https://api.openalex.org";

export const SIDO = [
  "서울", "경기", "인천", "강원", "대전", "세종", "충북", "충남",
  "광주", "전북", "전남", "대구", "경북", "부산", "울산", "경남", "제주",
] as const;
export type Sido = (typeof SIDO)[number];

// 순서 중요: "North Chungcheong"이 "Chungcheong"보다 먼저, 광역시가 도보다 먼저
const RULES: [RegExp, Sido][] = [
  [/seoul/i, "서울"],
  [/incheon/i, "인천"],
  [/daejeon/i, "대전"],
  [/sejong/i, "세종"],
  [/gwangju/i, "광주"], // 경기 광주시(Gwangju-si)는 region이 Gyeonggi라 region에서 먼저 걸린다
  [/daegu/i, "대구"],
  [/busan|pusan/i, "부산"],
  [/ulsan/i, "울산"],
  [/jeju/i, "제주"],
  [/gyeonggi|kyonggi/i, "경기"],
  [/gangwon|kangwon/i, "강원"],
  [/(north|buk).*chung|chung.*(buk|north)|chungbuk/i, "충북"],
  [/(south|nam).*chung|chung.*(nam|south)|chungnam/i, "충남"],
  [/(north|buk).*jeolla|jeolla.*(buk|north)|jeonbuk|chonbuk/i, "전북"],
  [/(south|nam).*jeolla|jeolla.*(nam|south)|jeonnam|chonnam/i, "전남"],
  [/(north|buk).*gyeongsang|gyeongsang.*(buk|north)|gyeongbuk|kyungpook/i, "경북"],
  [/(south|nam).*gyeongsang|gyeongsang.*(nam|south)|gyeongnam|kyungnam/i, "경남"],
];

// region이 비었을 때 city로 판정 (자주 나오는 연구 도시만)
const CITY: [RegExp, Sido][] = [
  [/suwon|seongnam|goyang|yongin|ansan|anyang|bucheon|hwaseong|pyeongtaek|uijeongbu|siheung|guri|anseong|jukjeon|pangyo|gimpo|paju|icheon/i, "경기"],
  [/chuncheon|wonju|w[oŏ]nju|gangneung|samcheok/i, "강원"],
  [/cheongju|chungju|ochang|osong/i, "충북"],
  [/cheonan|asan|gongju|dangjin|seosan|nonsan/i, "충남"],
  [/jeonju|wanju|iksan|gunsan/i, "전북"],
  [/suncheon|muan|mokpo|yeosu|naju|hwasun/i, "전남"],
  [/pohang|gyeongsan|gumi|andong|gyeongju|yeungnam/i, "경북"],
  [/changwon|jinju|gimhae|yangsan|geoje|tongyeong/i, "경남"],
];

export function toSido(region: string | null | undefined, city: string | null | undefined): Sido | null {
  for (const [re, s] of RULES) if (region && re.test(region)) return s;
  for (const [re, s] of [...CITY, ...RULES]) if (city && re.test(city)) return s;
  return null;
}

type OAGeo = { city: string | null; region: string | null };

export type InstitutionGeo = { sido: Sido | null; city: string | null };

const geoCache = new Map<string, InstitutionGeo>();

/** OpenAlex 기관 ID 여러 개의 위치를 한 번에(50개씩) 가져온다. 실패하면 빈 결과 (지역은 선택 정보). */
export async function fetchInstitutionGeo(ids: string[]): Promise<Map<string, InstitutionGeo>> {
  const out = new Map<string, InstitutionGeo>();
  const todo = [...new Set(ids)].filter((id) => {
    const hit = geoCache.get(id);
    if (hit) out.set(id, hit);
    return !hit;
  });
  const chunks = Array.from({ length: Math.ceil(todo.length / 50) }, (_, i) => todo.slice(i * 50, (i + 1) * 50));
  await Promise.allSettled(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({ filter: `openalex:${chunk.join("|")}`, per_page: "50", select: "id,geo" });
      if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
      const res = await fetch(`${BASE}/institutions?${params}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return;
      const data = (await res.json()) as { results: { id: string; geo: OAGeo | null }[] };
      for (const r of data.results) {
        const id = r.id.replace("https://openalex.org/", "");
        const g: InstitutionGeo = {
          sido: toSido(r.geo?.region, r.geo?.city),
          city: r.geo?.city ?? null,
        };
        geoCache.set(id, g);
        out.set(id, g);
      }
    }),
  );
  return out;
}
