"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, safeNextPath, useAuthState } from "@/lib/auth";
import { setupApi } from "@/features/organization/api";

export default function LoginForm() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, loading } = useAuthState();

  // 이미 로그인한 상태로 로그인 페이지에 오면 원래 가려던 곳으로 보냄
  useEffect(() => {
    if (!loading && user && !submitting) {
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    }
  }, [loading, user, submitting, router]);

  // 대표 계정이 아직 없으면 최초 설정 안내
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => {
    setupApi
      .status()
      .then((s) => setSetupOpen(s.available))
      .catch(() => setSetupOpen(false));
  }, []);

  useEffect(() => {
    const notice = sessionStorage.getItem("signup-notice");
    if (notice) {
      setMessage(notice);
      sessionStorage.removeItem("signup-notice");
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      await login(loginId.trim(), password);
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-section">
      <h1>전자결재 시스템</h1>
      <p className="auth-description">사내 계정으로 로그인하세요.</p>
      {setupOpen && (
        <p className="setup-notice">
          아직 대표 계정이 없습니다. 처음 설치했다면 <Link href="/setup">최초 대표 등록 →</Link>
        </p>
      )}
      <form id="login-form" method="post" onSubmit={handleSubmit}>
        <label htmlFor="login-id">아이디</label>
        <input id="login-id" value={loginId} onChange={(e) => setLoginId(e.target.value)}
          placeholder="아이디를 입력하세요" autoComplete="username" required />
        <label htmlFor="login-password">비밀번호</label>
        <input id="login-password" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호를 입력하세요"
          autoComplete="current-password" required />
        <button type="submit" className="main-button" disabled={submitting}>
          {submitting ? "로그인 중..." : "로그인"}
        </button>
      </form>
      {message && <p className="message" role="status">{message}</p>}
      <p className="form-link">계정이 없나요? <Link href="/signup">회원가입</Link></p>
    </section>
  );
}
