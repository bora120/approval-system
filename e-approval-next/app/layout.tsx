import type { Metadata } from "next";
import "./globals.css";
import "@/features/approval/approval.css";
import "@/features/messenger/messenger.css";
import "@/features/organization/organization.css";
import "@/features/pki/pki.css";

export const metadata: Metadata = {
  title: "전자결재시스템",
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
