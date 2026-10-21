"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signup } from "@/lib/auth";

const DEPARTMENTS = ["개발팀", "영업팀", "경영지원팀", "인사팀", "회계팀"];
const POSITIONS = [
  { value: "STAFF", label: "사원", needsApproval: false },
  { value: "TEAM_LEADER", label: "팀장", needsApproval: true },
  { value: "DIRECTOR", label: "본부장", needsApproval: true },
];

export default function SignupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    loginId: "", password: "", name: "", department: "", position: "STAFF",
  });
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedPosition = POSITIONS.find((position) => position.value === form.position);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (form.password !== passwordConfirm) {
      setMessage("비밀번호가 일치하지 않습니다.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await signup({ ...form, loginId: form.loginId.trim() });
      sessionStorage.setItem("signup-notice", result.message);
      router.push("/auth");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-section signup-section">
      <h1>회원가입</h1>
      <p className="auth-description">직책에 따라 관리자 승인이 필요할 수 있습니다.</p>
      <form id="signup-form" method="post" onSubmit={handleSubmit}>
        <label htmlFor="signup-id">아이디</label>
        <input id="signup-id" value={form.loginId} onChange={(e) => updateField("loginId", e.target.value)}
          placeholder="영문/숫자/_ 4~20자" pattern="[a-zA-Z0-9_]{4,20}" autoComplete="username" required />
        <label htmlFor="signup-password">비밀번호</label>
        <input id="signup-password" type="password" value={form.password}
          onChange={(e) => updateField("password", e.target.value)} placeholder="8자 이상"
          minLength={8} autoComplete="new-password" required />
        <label htmlFor="signup-password-check">비밀번호 확인</label>
        <input id="signup-password-check" type="password" value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" required />
        <label htmlFor="signup-name">이름</label>
        <input id="signup-name" value={form.name} onChange={(e) => updateField("name", e.target.value)} required />
        <label htmlFor="signup-department">부서</label>
        <select id="signup-department" value={form.department}
          onChange={(e) => updateField("department", e.target.value)} required>
          <option value="">부서를 선택하세요</option>
          {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
        <label htmlFor="signup-position">직책</label>
        <select id="signup-position" value={form.position}
          onChange={(e) => updateField("position", e.target.value)} required>
          {POSITIONS.map((position) => <option key={position.value} value={position.value}>{position.label}</option>)}
        </select>
        <p className="form-hint">부대표·대표 직책은 가입 후 대표가 조직 관리에서 지정합니다.</p>
        {selectedPosition?.needsApproval && (
          <p className="approval-notice">{selectedPosition.label} 직책은 관리자 승인 후 로그인할 수 있습니다.</p>
        )}
        <button type="submit" className="main-button" disabled={submitting}>
          {submitting ? "가입 중..." : "가입하기"}
        </button>
      </form>
      {message && <p className="message error-message" role="alert">{message}</p>}
      <p className="form-link">이미 계정이 있나요? <Link href="/auth">로그인</Link></p>
    </section>
  );
}
