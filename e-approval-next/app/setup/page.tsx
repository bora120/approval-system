import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SetupPage from "@/features/organization/pages/SetupPage";

export const metadata: Metadata = { title: "최초 대표 등록 - 전자결재 시스템" };

export default function SetupRoute() {
  return (
    <>
      <Header variant="auth" />
      <SetupPage />
      <Footer />
    </>
  );
}
