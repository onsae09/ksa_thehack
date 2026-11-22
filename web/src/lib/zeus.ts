/**
 * ZEUS(국가연구시설장비 종합정보시스템) 비공식 어댑터 — 해커톤 시연용
 *
 * - 모든 페이지가 SSO 확인 화면으로 보내는데, 주소에 sso_status=N을 붙이면 비로그인 상태로 바로 열린다(쿠키 불필요).
 * - 검색: GET /search?category=PRODUCT&subCategory=EQUIP&keyword=… (서버가 그린 HTML, 한 페이지 10건)
 *   customWhere="useScopeCd:!=:1]]idleDisuseCd:!=:4]]" → 단독활용·불용 제외 = 외부에서 쓸 수 있는 장비
 * - 상세: GET /search/equip/read/{id} → 보유기관·활용범위·표준분류·설치주소·문의번호·구축 과제의 연구책임자
 *
 * 원칙: 실패하면 조용히 빠진다. 같은 요청은 캐시한다. 장비담당자 정보(권한 필요 영역)는 건드리지 않는다.
 */

const BASE = "https://www.zeus.go.kr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT = 8000;
const CONCURRENCY = 4; // ZEUS에 한 번에 보내는 요청 수 상한

export const OPEN_USE_WHERE = "useScopeCd:!=:1]]idleDisuseCd:!=:4]]";

export type ZeusListItem = {
  id: string;
  name: string; // 장비명 (모델명 포함)
  nfecNo: string;
  scope: string; // 활용범위
  region: string;
  organ: string; // 보유기관
  maker: string;
  acquired: string; // 취득일자
  taskName: string;
  url: string;
};

export type ZeusDetail = {
  id: string;
  name: string;
  nameEn: string;
  organ: string;
  scope: string;
  status: string;
  category: string; // 표준분류
  phone: string;
  address: string;
  pi: string; // 구축 과제의 연구책임자
  piOrgan: string; // 구축 과제의 주관기관
  taskName: string;
  period: string;
  url: string;
};

export type ZeusSearch = { total: number; items: ZeusListItem[] };

const listCache = new Map<string, ZeusSearch>();
const detailCache = new Map<string, ZeusDetail | null>();

// 단순 동시성 제한: ZEUS에 요청이 몰리지 않게 한다
let active = 0;
const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

async function get(path: string): Promise<string> {
  const sep = path.includes("?") ? "&" : "?";
  return limited(async () => {
    const res = await fetch(`${BASE}${path}${sep}sso_status=N`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`ZEUS ${res.status}`);
    return res.text();
  });
}

function text(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** 검색어에서 괄호 속 약어 등을 떼어낸다: "공간 광변조기(SLM)" → "공간 광변조기" */
export function zeusKeyword(label: string): string {
  return label.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchEquip(
  keyword: string,
  opts: { openUse?: boolean; area?: string; page?: number } = {},
): Promise<ZeusSearch> {
  const params = new URLSearchParams({
    category: "PRODUCT",
    subCategory: "EQUIP",
    sort: "a", // 정확도순
    keyword,
    pageNum: String(opts.page ?? 1),
  });
  if (opts.openUse) params.set("customWhere", OPEN_USE_WHERE);
  if (opts.area) params.set("eqAreaCd", opts.area);
  const key = params.toString();
  const hit = listCache.get(key);
  if (hit) return hit;

  const html = await get(`/search?${key}`);
  const total = Number(html.match(/data-total="(\d+)"/)?.[1] ?? 0);
  const items: ZeusListItem[] = [];
  if (total > 0) {
    // 등록장비 목록 영역만 자른다 (아래쪽 다른 섹션의 item과 섞이지 않게)
    const start = html.indexOf('<div class="lst_01">');
    const end = html.indexOf('id="excelDownform"', start);
    const section = start >= 0 ? html.slice(start, end > start ? end : undefined) : "";
    for (const block of section.split('<div class="item">').slice(1)) {
      const id = block.match(/\/search\/equip\/read\/(\d+)/)?.[1];
      if (!id) continue;
      const name = text(block.match(/class="tit">([\s\S]*?)<\/a>/)?.[1] ?? "");
      const li = [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
      const field = (label: string) => li.find((s) => s.startsWith(label))?.replace(/^[^:]*:\s*/, "") ?? "";
      items.push({
        id,
        name,
        nfecNo: li.find((s) => s.startsWith("NFEC-")) ?? "",
        scope: field("활용범위"),
        region: field("지역"),
        organ: field("보유기관"),
        maker: field("제작사"),
        acquired: field("취득일자"),
        taskName: field("과제명"),
        url: `${BASE}/search/equip/read/${id}`,
      });
    }
  }
  const out = { total, items };
  listCache.set(key, out);
  return out;
}

export async function fetchEquipDetail(id: string): Promise<ZeusDetail | null> {
  if (detailCache.has(id)) return detailCache.get(id)!;
  try {
    const html = await get(`/search/equip/read/${id}`);
    const th = (label: string) => {
      const re = new RegExp(`<th[^>]*>\\s*${label}[^<]*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`);
      return text(html.match(re)?.[1] ?? "");
    };
    const head = html.match(/eq_info_head">\s*<strong class="tit">([\s\S]*?)<\/strong>\s*<span>([\s\S]*?)<\/span>/);
    const phoneBlock = text(html.match(/문의번호<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/)?.[1] ?? "");
    // 개인 휴대전화(010 등)는 보여주지 않는다. 기관 대표·부서 번호만.
    const phone = (phoneBlock.match(/\d{2,4}-\d{3,4}-\d{4}/)?.[0] ?? "").replace(/^01[016789]-.*/, "");
    const address = text(html.match(/위치보기[\s\S]*?<dt>([\s\S]*?)<\/dt>/)?.[1] ?? "");
    const d: ZeusDetail = {
      id,
      name: text(head?.[1] ?? ""),
      nameEn: text(head?.[2] ?? ""),
      organ: th("보유기관명"),
      scope: th("활용범위"),
      status: th("활용상태"),
      category: th("표준분류"),
      phone,
      address,
      pi: th("연구책임자"),
      piOrgan: th("주관기관"),
      taskName: th("세부과제명"),
      period: th("과제수행기간"),
      url: `${BASE}/search/equip/read/${id}`,
    };
    detailCache.set(id, d.name ? d : null);
    return d.name ? d : null;
  } catch {
    return null; // 일시 오류는 캐시하지 않는다
  }
}

/** 기관명 비교용: "재단법인", "(주)", "산학협력단", 공백 등을 뗀다 */
export function normOrgan(s: string): string {
  return s
    .replace(/\(재\)|\(주\)|\(사\)|재단법인|사단법인|주식회사|산학협력단|산학협력기관|국립/g, "")
    .replace(/[\s·.()]/g, "")
    .trim();
}

export function zeusSearchUrl(keyword: string, openUse: boolean): string {
  const p = new URLSearchParams({ category: "PRODUCT", subCategory: "EQUIP", sort: "a", keyword });
  if (openUse) p.set("customWhere", OPEN_USE_WHERE);
  return `${BASE}/search?${p}&sso_status=N`;
}
