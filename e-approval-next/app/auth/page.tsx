import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "로그인 - 전자결재 시스템" };

export default function AuthPage() {
  return (
    <>
      <Header variant="auth" />
      <main className="form-main">
        <div className="form-box"><LoginForm /></div>
      </main>
      <Footer />
    </>
  );
}
