import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SignupForm from "@/components/SignupForm";

export const metadata: Metadata = { title: "회원가입 - 전자결재 시스템" };

export default function SignupPage() {
  return (
    <>
      <Header variant="auth" />
      <main className="form-main">
        <div className="form-box"><SignupForm /></div>
      </main>
      <Footer />
    </>
  );
}
