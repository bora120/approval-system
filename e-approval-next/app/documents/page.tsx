"use client";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import DocumentListPage from "@/features/approval/pages/DocumentListPage";
export default function DocumentsRoute() { return <><Header /><RequireAuth><Suspense fallback={<main className="main">문서함을 불러오는 중...</main>}><DocumentListPage /></Suspense></RequireAuth><Footer /></>; }
