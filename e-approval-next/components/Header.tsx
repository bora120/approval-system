"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canManageUsers, logout, useAuthState } from "@/lib/auth";
import { useUnreadCount } from "@/features/messenger/useUnreadCount";
import { usePendingApprovalNotifications } from "@/features/approval/usePendingApprovalNotifications";
import { useSigningSession } from "@/features/pki/useSigningSession";

type Props = { variant?: "home" | "auth" | "default" };

export default function Header({ variant = "default" }: Props) {
  const router = useRouter();
  const { user, isLoggedIn, loading } = useAuthState();
  const enabled = variant !== "auth" && isLoggedIn;
  const unread = useUnreadCount(enabled);
  const approval = usePendingApprovalNotifications(enabled); // 결재 대기 건수 + 새 결재 브라우저 알림
  const signing = useSigningSession(enabled ? user?.loginId : undefined); // 인증서 인증 상태

  async function handleLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  if (variant === "auth") {
    return (
      <header className="header">
        <Link href="/" className="logo">전자결재 시스템</Link>
        <nav>
          <Link href="/auth">로그인</Link>
          <Link href="/signup">회원가입</Link>
        </nav>
      </header>
    );
  }

  return (
    <header className="header">
      <Link href="/" className="logo">전자결재 시스템</Link>
      <nav>
        {!loading && !isLoggedIn && <Link href="/auth">로그인</Link>}
        {isLoggedIn && user && (
          <>
            <span className="header-user-label">{user.department} · {user.positionLabel} {user.name}님</span>
            <Link href="/messenger" className="header-messenger">
              메신저
              {unread > 0 && <span className="header-badge">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <Link href="/documents?tab=INBOX" className="header-messenger" aria-label={`결재 대기 ${approval.count}건`}>
              결재함
              {approval.count > 0 && <span className="header-badge">{approval.count > 99 ? "99+" : approval.count}</span>}
            </Link>
            {approval.canRequestPermission && (
              <button
                type="button"
                className="header-admin-link"
                onClick={() => { void approval.requestPermission(); }}
                title="새 결재가 도착하면 브라우저 알림을 띄웁니다."
              >
                알림 켜기
              </button>
            )}
            {canManageUsers(user) && (
              <Link href="/admin" className="header-admin-link">
                조직 관리
              </Link>
            )}
            <Link
              href="/certificate"
              className={signing.active ? "header-cert is-unlocked" : "header-cert"}
              title={signing.active ? "인증서 인증됨 — 암호 없이 서명할 수 있습니다" : "인증서 잠김 — 서명할 때 암호를 입력합니다"}
            >
              {signing.active ? "🔓 인증서" : "🔒 인증서"}
            </Link>
            <Link href="/mypage">마이페이지</Link>
            <a href="/auth" onClick={(event) => { event.preventDefault(); void handleLogout(); }}>로그아웃</a>
          </>
        )}
      </nav>
    </header>
  );
}
