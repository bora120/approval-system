import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomeMenu from "@/components/HomeMenu";
import Brand from "@/components/Brand";
import OrganizationTree from "@/features/organization/components/OrganizationTree";

export default function HomePage() {
  return (
    <>
      <Header variant="home" />

      <main className="main">
        <h1 className="brand-title"><Brand size="hero" /></h1>

        <p className="description">
          파일과 문서를 암호화해 주고받고, 인증서 전자서명으로 결재하는 기업용 보안 업무 시스템
        </p>

        <HomeMenu />
        <OrganizationTree />
      </main>

      <Footer />
    </>
  );
}
