import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import FileBoxPage from "@/features/messenger/pages/FileBoxPage";

export const metadata: Metadata = { title: "파일함 - 전자결재 시스템" };

export default function FilesRoute() {
  return (
    <>
      <Header />
      <RequireAuth>
        <Suspense fallback={<main className="main">파일함을 불러오는 중...</main>}>
          <FileBoxPage />
        </Suspense>
      </RequireAuth>
      <Footer />
    </>
  );
}
