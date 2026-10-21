import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import MessengerPage from "@/features/messenger/pages/MessengerPage";

export const metadata: Metadata = { title: "메신저 - 전자결재 시스템" };

export default function MessengerRoute() {
  return (
    <>
      <Header />
      <RequireAuth>
        <Suspense fallback={<main className="main">메신저를 불러오는 중...</main>}>
          <MessengerPage />
        </Suspense>
      </RequireAuth>
      <Footer />
    </>
  );
}
