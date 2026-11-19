import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import SendFilePage from "@/features/messenger/pages/SendFilePage";

export const metadata: Metadata = { title: "파일 전송 - nano system" };

export default function SendRoute() {
  return (
    <>
      <Header />
      <RequireAuth>
        <SendFilePage />
      </RequireAuth>
      <Footer />
    </>
  );
}
