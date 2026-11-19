import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import RequireAuth from "@/components/RequireAuth";
import OrganizationPage from "@/features/organization/pages/OrganizationPage";

export const metadata: Metadata = { title: "조직 관리 - nano system" };

export default function AdminRoute() {
  return (
    <>
      <Header />
      <RequireAuth roles={["ADMIN", "SUPER_ADMIN"]}>
        <OrganizationPage />
      </RequireAuth>
      <Footer />
    </>
  );
}
