"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthState, type Role } from "@/lib/auth";

interface Props {
  children: React.ReactNode;
  /** 지정하면 이 권한을 가진 사용자만 볼 수 있음 (서버에서도 반드시 다시 검사함) */
  roles?: Role[];
}

/** 로그인해야 볼 수 있는 화면을 감싼다. 로그인 안 했으면 로그인 페이지로 보낸다. */
export default function RequireAuth({ children, roles }: Props) {
  const { user, loading } = useAuthState();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname + window.location.search;
      router.replace(`/auth?next=${encodeURIComponent(next)}`);
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    return (
      <main className="main">
        <p className="description">로그인 상태를 확인하고 있어요...</p>
      </main>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <main className="main">
        <h1>접근 권한이 없습니다</h1>
        <p className="description">이 화면은 관리자만 사용할 수 있습니다.</p>
        <Link href="/">홈으로</Link>
      </main>
    );
  }
  return <>{children}</>;
}
