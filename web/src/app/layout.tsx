import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LabFit KR",
  description: "연구 주제와 방법을 넣으면, 그 주제를 그 방법으로 연구해본 근거가 있는 한국 연구자를 논문 링크와 함께 보여줍니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
