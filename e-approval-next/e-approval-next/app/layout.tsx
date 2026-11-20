import type { Metadata } from "next";
import { themeBootScript } from "@/features/events/events";
import "./pretendard.css"; // 본문 글꼴 Pretendard (OFL, public/fonts/pretendard)
import "./globals.css";
import "@/features/approval/approval.css";
import "@/features/messenger/messenger.css";
import "@/features/organization/organization.css";
import "@/features/pki/pki.css";
import "@/features/events/events.css";

export const metadata: Metadata = {
  title: "nano system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 이벤트 테마(theme-night)는 화면이 그려지기 전에 <head> 스크립트가 html 에 붙인다 → 서버 HTML 과 달라도 경고 안 띄움
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
