import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MyPageContent from "./MyPageContent";
import RequireAuth from "@/components/RequireAuth";

export const metadata: Metadata = { title: "마이페이지" };

export default function MyPage() {
  return <><Header /><main className="main"><h1>마이페이지</h1><RequireAuth><MyPageContent /></RequireAuth></main><Footer /></>;
}
