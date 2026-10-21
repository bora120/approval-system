"use client";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import DocumentWritePage from "@/features/approval/pages/DocumentWritePage";
export default function NewDocumentRoute() { return <><Header /><RequireAuth><Suspense fallback={<main className="main">작성 화면을 불러오는 중...</main>}><DocumentWritePage /></Suspense></RequireAuth><Footer /></>; }
