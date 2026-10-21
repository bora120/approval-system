"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { setupApi, type CeoSetupForm, type SetupStatus } from "../api";

const EMPTY: CeoSetupForm = { setupToken: "", loginId: "", password: "", name: "", department: "경영지원팀" };

/**
 * 최초 대표 등록 (/setup)
 * 대표(최고 관리자)가 아직 없을 때 한 번만 쓸 수 있다.
 * 백엔드를 실행한 사람만 아는 "초기 설정 토큰"이 있어야 등록할 수 있다.
 */
export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [form, setForm] = useState<CeoSetupForm>(EMPTY);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setupApi
      .status()
      .then(setStatus)
      .catch((e: Error) => setError(e.message));
  }, []);

  const update = (key: keyof CeoSetupForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const ceo = await setupApi.registerCeo({ ...form, loginId: form.loginId.trim() });
      setDone(ceo.loginId);
      setForm(EMPTY);
      setPasswordConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="form-main">
      <div className="form-box org-setup">
        <h1>최초 대표 등록</h1>
        <p className="auth-description">
          회사의 대표(최고 관리자) 계정을 만듭니다. 대표는 관리자 지정, 부대표 지정을 할 수 있으며 이 화면은 대표 계정이
          만들어지면 자동으로 닫힙니다.
        </p>

        {done ? (
          <div className="org-done">
            <p>
              대표 계정 <strong>{done}</strong> 이(가) 만들어졌습니다.
            </p>
            <Link href="/auth" className="main-button">
              로그인하러 가기
            </Link>
          </div>
        ) : !status && !error ? (
          <p>설정 상태를 확인하고 있어요...</p>
        ) : status && !status.available ? (
          <div className="org-done">
            <p>대표 계정이 이미 등록되어 최초 설정이 닫혔습니다.</p>
            <Link href="/auth">로그인하기 →</Link>
          </div>
        ) : status ? (
          <form className="org-form" onSubmit={submit}>
            <div className="org-token-guide">
              {status.tokenFromEnv ? (
                <>
                  백엔드를 실행할 때 환경변수 <code>CEO_SETUP_TOKEN</code> 에 설정한 값을 입력하세요.
                </>
              ) : (
                <>
                  백엔드 터미널에 출력된 <strong>초기 설정 토큰</strong>을 입력하세요.
                  <br />
                  <small>(&quot;아직 대표 계정이 없습니다&quot; 안내 박스의 &quot;토큰&quot; 값 · 서버를 다시 켜면 새 토큰이 출력됩니다)</small>
                </>
              )}
            </div>

            <label htmlFor="setup-token">초기 설정 토큰</label>
            <input
              id="setup-token"
              type="password"
              autoComplete="off"
              required
              value={form.setupToken}
              onChange={(e) => update("setupToken", e.target.value)}
            />

            <label htmlFor="setup-id">대표 아이디</label>
            <input
              id="setup-id"
              required
              pattern="[a-zA-Z0-9_]{4,20}"
              placeholder="영문/숫자/_ 4~20자"
              autoComplete="username"
              value={form.loginId}
              onChange={(e) => update("loginId", e.target.value)}
            />

            <label htmlFor="setup-pw">비밀번호</label>
            <input
              id="setup-pw"
              type="password"
              required
              minLength={8}
              placeholder="8자 이상"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />

            <label htmlFor="setup-pw2">비밀번호 확인</label>
            <input
              id="setup-pw2"
              type="password"
              required
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />

            <label htmlFor="setup-name">대표 이름</label>
            <input id="setup-name" required maxLength={30} value={form.name} onChange={(e) => update("name", e.target.value)} />

            <label htmlFor="setup-dept">부서</label>
            <input
              id="setup-dept"
              required
              maxLength={50}
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
            />

            <button type="submit" className="main-button" disabled={submitting}>
              {submitting ? "등록 중..." : "대표 계정 만들기"}
            </button>
          </form>
        ) : null}

        {error && (
          <p className="message error-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
