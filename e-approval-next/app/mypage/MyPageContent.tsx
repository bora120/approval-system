"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ROLE_LABEL, useAuthState } from "@/lib/auth";
import { documentApi } from "@/features/approval/api";
import StatusBadge from "@/features/approval/components/StatusBadge";
import type { DocumentSummary } from "@/features/approval/types";
import { formatDate } from "@/features/approval/utils";

const STATUS_TEXT = { ACTIVE: "정상", PENDING: "승인 대기", REJECTED: "승인 거절" } as const;

export default function MyPageContent() {
  const { user, loading } = useAuthState();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    documentApi
      .myDocuments()
      .then((list) => alive && setDocs(list.slice(0, 5)))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [user]);

  return (
    <>
      <section className="mypage-section">
        <h2>회원정보</h2>
        <div className="info-box">
          {loading ? <p>회원정보를 불러오는 중입니다.</p> : user ? <>
            <p><strong>이름</strong>{user.name}</p>
            <p><strong>아이디</strong>{user.loginId}</p>
            <p><strong>부서</strong>{user.department}</p>
            <p><strong>직책</strong>{user.positionLabel}</p>
            <p><strong>권한</strong>{ROLE_LABEL[user.role]}</p>
            <p><strong>가입 상태</strong>{STATUS_TEXT[user.status as keyof typeof STATUS_TEXT] ?? user.status}</p>
          </> : <p>로그인이 필요합니다. <Link href="/auth">로그인하기</Link></p>}
        </div>
      </section>
      <section className="mypage-section">
        <div className="section-head">
          <h2>최근 문서</h2>
          <Link href="/documents">전체 보기</Link>
        </div>
        <div className="history-box">
          {error ? <p className="muted">{error}</p>
            : docs === null ? <p className="muted">불러오는 중...</p>
            : docs.length === 0 ? <p className="muted">작성한 문서가 없습니다.</p>
            : docs.map((d) => (
              <Link className="history-item" key={d.id} href={`/documents/${d.id}`}>
                <span className="history-title">{d.title || "(제목 없음)"}<small>{d.typeLabel} · {formatDate(d.createdAt)}</small></span>
                <StatusBadge status={d.status} />
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}
