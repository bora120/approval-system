"use client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import DocumentDetailPage from "@/features/approval/pages/DocumentDetailPage";
export default function DocumentDetailRoute() { return <><Header /><RequireAuth><DocumentDetailPage /></RequireAuth><Footer /></>; }
