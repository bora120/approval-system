import type { Metadata } from "next";
import "./pretendard.css"; // 본문 글꼴 Pretendard (OFL, public/fonts/pretendard)
import "./globals.css";
import "@/features/approval/approval.css";
import "@/features/messenger/messenger.css";
import "@/features/organization/organization.css";
import "@/features/pki/pki.css";

export const metadata: Metadata = {
  title: "nano system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
