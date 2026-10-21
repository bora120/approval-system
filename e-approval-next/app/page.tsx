import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomeMenu from "@/components/HomeMenu";

export default function HomePage() {
  return (
    <>
      <Header variant="home" />

      <main className="main">
        <h1>전자결재 시스템</h1>

        <p className="description">
          파일 및 문서를 암호화하여 전송 및 결재 가능한 기업용 전자결재 시스템
        </p>

        <HomeMenu />
      </main>

      <Footer />
    </>
  );
}
