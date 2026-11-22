import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import Overview from "./Overview";

// 영문 워드마크·숫자 전용. 한글은 전역 글꼴(본문 IBM Plex Sans KR, 제목 마루부리)로 그린다.
const latin = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: "서비스 소개 — LabFit KR",
  description:
    "연구 질문이나 연구제안서 PDF로, 그 주제를 그 방법으로 연구해 본 국내 교수님을 찾습니다. 논문 초록·연구실 페이지·국가연구시설장비(ZEUS)·국가과제(NTIS)의 원문 문장을 근거로 보여줍니다.",
};

export default function OverviewPage() {
  return <Overview fontClass={latin.variable} latinFamily={latin.style.fontFamily} />;
}
