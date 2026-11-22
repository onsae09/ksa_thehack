import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const serifKr = Noto_Serif_KR({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-serif-kr",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "LabFit KR — 근거로 찾는 지도교수 후보",
  description: "연구 주제와 방법을 넣으면, 그 주제를 그 방법으로 연구해본 근거가 있는 한국 연구자를 논문 링크와 함께 보여줍니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f9f8f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${serifKr.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
