import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

// 본문: IBM Plex Sans KR (OFL) — 단정한 학술·기술 톤. 제목: 마루부리(globals.css @font-face, 네이버 공식 CDN)
const sansKr = IBM_Plex_Sans_KR({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-sans-kr",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "LabFit KR — 근거로 찾는 지도교수 후보",
  description: "연구 주제와 방법을 넣으면, 그 주제를 그 방법으로 연구해본 근거가 있는 한국 연구자를 논문 링크와 함께 보여줍니다.",
};

// 페이지 하나짜리 앱이라 페이지 간 이동이 없다. Next 16의 "즉시 이동(instant)" 검증은 개발 모드에서만
// 오버레이 경고를 띄우고 빌드·배포에는 영향이 없어서 끈다.
export const instant = false;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f9f8f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${sansKr.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
