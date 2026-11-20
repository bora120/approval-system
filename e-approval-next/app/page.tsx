import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomeMenu from "@/components/HomeMenu";
import Brand from "@/components/Brand";
import OrganizationTree from "@/features/organization/components/OrganizationTree";
import EventStage from "@/features/events/EventStage";

export default function HomePage() {
  return (
    <>
      <Header variant="home" />

      {/* 기념일(크리스마스 등)에는 배경 이미지 + 움직이는 효과 — features/events/events.ts 에서 기간 설정 */}
      <EventStage>
        <main className="main">
          <div className="home-hero">
            <h1 className="brand-title"><Brand size="hero" /></h1>

            <p className="description">
              파일과 문서를 암호화해 주고받고, 인증서 전자서명으로 결재하는 기업용 보안 업무 시스템
            </p>
          </div>

          <HomeMenu />
          <OrganizationTree />
        </main>
      </EventStage>

      <Footer />
    </>
  );
}
