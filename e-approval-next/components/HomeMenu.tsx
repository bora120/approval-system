"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canManageUsers, useAuthState } from "@/lib/auth";

export default function HomeMenu() {
  const router = useRouter();
  const { user, isLoggedIn, loading } = useAuthState();

  function handleProtectedClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isLoggedIn) {
      event.preventDefault();
      alert("로그인이 필요한 서비스입니다.");
      router.push("/auth");
    }
  }

  return (
    <>
      <div className={isLoggedIn ? "login-notice hidden" : "login-notice"}>
        <p>{loading ? "로그인 상태를 확인하고 있어요." : "로그인 후 사용 가능합니다."}</p>
        {!isLoggedIn && <Link href="/auth">로그인하기</Link>}
      </div>
      <div className="menu-grid">
        <Link href="/documents/new" className="menu-box send-box protected-menu" onClick={handleProtectedClick}>
          <h2>문서 작성</h2><p>기안서·지출결의서·휴가신청서를 작성하고 결재를 요청합니다.</p>
        </Link>
        <Link href="/documents" className="menu-box document-box protected-menu" onClick={handleProtectedClick}>
          <h2>내 문서함</h2><p>작성·상신한 문서와 진행 상태를 확인합니다.</p>
        </Link>
        <Link href="/documents?tab=INBOX" className="menu-box approval-box protected-menu" onClick={handleProtectedClick}>
          <h2>결재 대기 문서</h2><p>내가 결재할 차례인 문서를 확인합니다.</p>
        </Link>
        <Link href="/messenger" className="menu-box messenger-box protected-menu" onClick={handleProtectedClick}>
          <h2>메신저</h2><p>동료와 종단간 암호화된 1:1 메시지를 주고받습니다.</p>
        </Link>
        <Link href="/send" className="menu-box file-box protected-menu" onClick={handleProtectedClick}>
          <h2>파일 전송</h2><p>여러 파일을 여러 사람에게 암호화해서 안전하게 보냅니다.</p>
        </Link>
        <Link href="/files" className="menu-box filebox-box protected-menu" onClick={handleProtectedClick}>
          <h2>파일함</h2><p>주고받은 파일과 수신 확인 상태를 한눈에 봅니다.</p>
        </Link>
        {canManageUsers(user) && (
          <Link href="/admin" className="menu-box admin-box">
            <h2>조직 관리</h2><p>가입 승인, 직책 변경{user?.role === "SUPER_ADMIN" ? ", 부대표·관리자 지정" : ""}을 합니다.</p>
          </Link>
        )}
      </div>
    </>
  );
}
