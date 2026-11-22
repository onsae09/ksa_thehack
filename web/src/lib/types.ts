export const METHOD_OPTIONS = ["시뮬레이션", "실험", "이론", "데이터 분석"] as const;

/** method: 방법 / equipment: 장비·측정 기법 (ZEUS 조회) / data: 데이터셋·DB·소프트웨어 (공공데이터포털 조회) */
export type ItemKind = "method" | "equipment" | "data";

export type SearchInput = {
  question: string;
  methods: string[];
  equipment: string; // 장비·측정 기법. 쉼표 구분, 비어 있으면 시스템이 추정
  data?: string; // 데이터셋·DB·소프트웨어. 쉼표 구분, 비어 있으면 (데이터 분석일 때) 시스템이 추정
  region?: string; // 시·도, 비어 있으면 전국
};

/** Claude가 입력을 정리한 결과 */
export type CheckItem = {
  label: string; // 화면에 보일 이름 (한국어)
  kind: ItemKind;
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
  ntis_queries_ko: string[]; // NTIS 과제명 검색용 (격식 있는 기술 용어 1~2단어)
  items: CheckItem[];
  /** 학생이 적은 장비 이름에서 그대로 만든 검색어 (실행마다 달라지지 않게). 예전 캐시 결과에는 없음 */
  equipment_queries?: string[];
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
  kind: ItemKind;
  inferred: boolean;
  evidence: Evidence | null; // null = 초록에서 근거 없음
};

export type Candidate = {
  authorId: string;
  name: string;
  /** 한글 이름 (OpenAlex 저자 기록의 한글 표기가 영문 이름과 로마자로 맞을 때만). 화면은 연구실 페이지·NTIS·ZEUS 이름으로도 보충 */
  nameKo?: string | null;
  orcid: string | null;
  institution: string;
  institutionId: string;
  institutionType: string;
  orgKind: "university" | "institute";
  /** 기관 소재 시·도 (OpenAlex 기관 위치 기준, 모르면 null). 예전 캐시 결과에는 없을 수 있다 */
  sido?: string | null;
  /** 현재 소속 확인 (OpenAlex 저자 기록의 기관별 연도 기준) */
  affiliation: AffiliationCheck;
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
  /**
   * 순위 묶음 (예전 캐시 결과에는 없을 수 있다 → main으로 본다)
   * - main: 점수순 본 순위
   * - weak: 모든 요구 항목에 초록 근거가 없고 방법 적합도도 낮음 → 근거가 있는 후보 뒤로 (숨기지 않음)
   * - affiliation: 이 기관 기록이 오래됐고 그 뒤 기록이 해외 기관 → 순위에서 빼고 "소속 확인 필요"로 따로 보여줌
   */
  group?: CandidateGroup;
  /** group이 main이 아닐 때 화면에 그대로 보여줄 이유 */
  groupReason?: string | null;
  /** 점수만으로 매긴 순위 (묶음 규칙 적용 전, 1부터) */
  scoreRank?: number;
};

export type CandidateGroup = "main" | "weak" | "affiliation";

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
  stats: {
    papers: number;
    authors: number;
    ms: number;
    exaPapers?: number; // Exa 의미 검색으로 추가된 논문 수
    /** 책임저자 전원의 점수 (내림차순, 소수 셋째 자리). 연락 예정 교수가 몇 위 수준인지 비교용 */
    scores?: number[];
  };
  /** 저장된 결과를 돌려준 경우 처음 검색한 시각 (새로 검색한 응답에는 없음) */
  cachedAt?: string;
};

/** current: 최근 2년 안에 이 기관 소속으로 논문 있음 / stale: 마지막이 오래됨(이동·은퇴 가능) / unknown: 기록 없음 */
export type AffiliationCheck = {
  status: "current" | "stale" | "unknown";
  lastYear: number | null; // 이 기관 소속으로 마지막 논문이 나온 해
  note: string | null; // 예: "2026년 이후 Harbin Institute of Technology 소속 기록"
  /** stale일 때 이 기관 이후의 다른 기관 기록 (한국 기관이 있으면 그것) */
  later?: { institution: string; country: string | null; year: number } | null;
};

/** NTIS 국가R&D 과제 (목록 화면 기준. 상세는 로그인 필요) */
export type NtisProject = {
  id: string;
  title: string;
  year: number; // 사업연도
  period: string | null; // "2020 ~ 2022"
  program: string; // 사업명
  pi: string; // 연구책임자 (한글)
  organ: string; // 수행기관
  ministry: string;
  funding: number | null; // 해당 연도 정부연구비(원)
  url: string;
  similarity: number; // 연구 질문과 과제명 유사도
};

export type ProjectsResult = {
  status: "ok" | "failed";
  /** 질문과 가까운 최근 과제 (대학·연구기관만, 같은 과제의 연차는 하나로) */
  projects: NtisProject[];
  /** OpenAlex 후보(authorId)별: 같은 기관 + 이름 표기 일치 */
  byCandidate: Record<string, NtisProject[]>;
  /** 국내(DBpia) 후보 이름별: 이름 일치 (기관 미확인) */
  byDomestic: Record<string, NtisProject[]>;
  /** 후보 목록에 없는 과제 책임자 (놓친 후보일 수 있음) */
  others: { pi: string; organ: string; projects: NtisProject[] }[];
};

/** Exa로 찾은 연구실 홈페이지 확인 결과 */
export type LabPage = {
  url: string;
  title: string;
  koName: string | null; // 페이지에서 확인한 한글 이름
  equipment: { label: string; snippet: string }[]; // 페이지에 적힌 필요 장비
};

export type LabPagesResult = {
  status: "ok" | "disabled" | "failed"; // disabled: EXA_API_KEY 없음
  byCandidate: Record<string, LabPage>;
};

/** /api/search 진행 이벤트 (stream: true일 때 한 줄씩 보낸다). 숫자는 실제 값 */
export type SearchStage = "normalize" | "collect" | "score" | "evidence";
export type SearchProgressEvent = {
  stage: SearchStage | "domestic";
  status: "start" | "done";
  detail?: string; // 화면에 그대로 보여줄 한 줄 (예: "논문 232편 · Exa 의미 검색 23편 포함")
};

/** 공공데이터포털(data.go.kr) 데이터셋 — 데이터 항목을 어디서 받을 수 있는지 */
export type PublicDataset = {
  id: string;
  title: string;
  provider: string; // 제공기관
  type: "파일" | "오픈API" | "기타";
  formats: string[]; // CSV, JSON+XML 등
  summary: string;
  modified: string | null; // 수정일
  url: string;
};

export type DatasetsResult = {
  status: "ok" | "failed";
  items: { label: string; keyword: string; total: number; searchUrl: string; datasets: PublicDataset[] }[];
};
