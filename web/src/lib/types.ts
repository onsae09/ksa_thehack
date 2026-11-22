export const METHOD_OPTIONS = ["시뮬레이션", "실험", "이론", "데이터 분석"] as const;

export type SearchInput = {
  question: string;
  methods: string[];
  equipment: string; // 쉼표 구분, 비어 있으면 시스템이 추정
  region?: string; // 시·도, 비어 있으면 전국
};

/** Claude가 입력을 정리한 결과 */
export type CheckItem = {
  label: string; // 화면에 보일 이름 (한국어)
  kind: "method" | "equipment";
  keywords_en: string[]; // 초록에서 찾을 영문 키워드
  keywords_ko: string[]; // 국내 논문(DBpia) 초록에서 찾을 한국어 키워드
  inferred: boolean; // 학생이 쓰지 않고 시스템이 추정한 항목
};

export type Normalized = {
  query_en: string;
  search_queries: string[];
  search_queries_ko: string[];
  method_query_en: string; // 방법·장비를 설명하는 영문 한 문장 (방법 적합도 M 계산용)
  method_search_queries: string[];
  method_search_queries_ko: string[];
  items: CheckItem[];
};

export type Paper = {
  id: string;
  title: string;
  year: number;
  url: string;
  abstract: string;
};

export type Evidence = {
  sentence: string;
  matched: string; // 근거로 잡힌 키워드 (화면에서 강조)
  onTopic: boolean; // true: 이 주제로 검색된 논문, false: 같은 연구자의 다른 논문
  paperTitle: string;
  url: string;
};

export type ItemResult = {
  label: string;
  kind: "method" | "equipment";
  inferred: boolean;
  evidence: Evidence | null; // null = 초록에서 근거 없음
};

export type Candidate = {
  authorId: string;
  name: string;
  orcid: string | null;
  institution: string;
  institutionId: string;
  institutionType: string;
  orgKind: "university" | "institute";
  koreanName: boolean; // 이름 기준 추정
  T: number; // 주제 적합도
  fit: "높음" | "중간" | "낮음";
  M: number; // 방법 적합도
  methodFit: "높음" | "중간" | "낮음";
  score: number; // 0.5·T + 0.5·M (순위 기준)
  topPapers: (Paper & { similarity: number; methodSimilarity: number })[];
  items: ItemResult[];
  warning: string | null;
  links: { openalex: string; orcid: string | null; search: string };
};

export type DomesticCandidate = {
  ancId: string;
  name: string;
  koreanName: boolean;
  nameEn: string | null;
  paperCount: string | null;
  fields: string[];
  T: number; // 주제 적합도
  fit: "높음" | "중간" | "낮음";
  M: number; // 방법 적합도
  methodFit: "높음" | "중간" | "낮음";
  score: number; // 0.5·T + 0.5·M (순위 기준)
  topPapers: (Paper & { similarity: number; methodSimilarity: number; journal: string })[];
  items: ItemResult[];
  warning: string | null;
  links: { dbpia: string; search: string };
};

export type SearchResult = {
  normalized: Normalized;
  candidates: Candidate[];
  domestic: { status: "ok" | "failed"; candidates: DomesticCandidate[] };
  stats: { papers: number; authors: number; ms: number };
};
