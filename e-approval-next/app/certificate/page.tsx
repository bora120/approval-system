"use client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import CertificatePage from "@/features/pki/pages/CertificatePage";
export default function CertificateRoute() { return <><Header /><RequireAuth><CertificatePage /></RequireAuth><Footer /></>; }
