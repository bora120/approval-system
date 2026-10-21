"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROLE_LABEL, useAuthState, type User } from "@/lib/auth";
import { ASSIGNABLE_POSITIONS, organizationApi, type Position } from "../api";

type Filter = "ALL" | "PENDING" | "MANAGERS";

const STATUS_LABEL: Record<User["status"], string> = { PENDING: "승인 대기", ACTIVE: "사용 중", REJECTED: "거절됨" };

/**
 * 조직 관리 (/admin) — 관리자·대표 전용
 *  - 관리자: 가입 승인/거절, 사원~본부장 직책 변경
 *  - 대표:   위 기능 + 부대표 지정/해제 + 관리자 권한 부여/회수
 * (화면은 안내용이고, 실제 권한 검사는 서버 OrganizationService 에서 한다)
 */
export default function OrganizationPage() {
  const { user: me } = useAuthState();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [keyword, setKeyword] = useState("");

  const isCeo = me?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await organizationApi.allUsers());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "직원 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (updated: User) => setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));

  const run = async (target: User, action: () => Promise<User>, doneMessage: string) => {
    setBusyId(target.id);
    setError("");
    setNotice("");
    try {
      replace(await action());
      setNotice(doneMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const changePosition = (u: User, position: Position) => {
    const label = ASSIGNABLE_POSITIONS.find((p) => p.value === position)?.label ?? position;
    if (position === "VICE_CEO" && !window.confirm(`${u.name}님을 부대표로 지정할까요?`)) return;
    void run(u, () => organizationApi.changePosition(u.id, position), `${u.name}님의 직책을 ${label}(으)로 바꿨습니다.`);
  };

  const changeRole = (u: User, role: "USER" | "ADMIN") => {
    const msg =
      role === "ADMIN"
        ? `${u.name}님에게 관리자 권한을 줄까요?\n가입 승인과 직책 변경을 할 수 있게 됩니다.`
        : `${u.name}님의 관리자 권한을 회수할까요?`;
    if (!window.confirm(msg)) return;
    void run(u, () => organizationApi.changeRole(u.id, role), `${u.name}님의 권한을 ${ROLE_LABEL[role]}(으)로 바꿨습니다.`);
  };

  const decide = (u: User, approve: boolean) => {
    if (!approve && !window.confirm(`${u.name}님의 가입을 거절할까요?`)) return;
    void run(
      u,
      () => (approve ? organizationApi.approve(u.id) : organizationApi.reject(u.id)),
      `${u.name}님의 가입을 ${approve ? "승인" : "거절"}했습니다.`,
    );
  };

  const counts = useMemo(
    () => ({
      all: users.length,
      pending: users.filter((u) => u.status === "PENDING").length,
      managers: users.filter((u) => u.role !== "USER").length,
    }),
    [users],
  );

  const shown = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "PENDING" && u.status !== "PENDING") return false;
      if (filter === "MANAGERS" && u.role === "USER") return false;
      if (!k) return true;
      return [u.name, u.loginId, u.department ?? "", u.positionLabel].some((v) => v.toLowerCase().includes(k));
    });
  }, [users, filter, keyword]);

  if (!me) return null;

  return (
    <main className="org-page">
      <nav className="org-breadcrumb">
        <Link href="/">홈</Link> › 조직 관리
      </nav>
      <h1 className="org-title">조직 및 계정 관리</h1>
      <p className="org-lead">
        {isCeo
          ? "대표는 가입 승인, 직책 변경, 부대표 지정, 관리자 권한 부여·회수를 할 수 있습니다."
          : "관리자는 가입 승인과 사원~본부장 직책 변경을 할 수 있습니다. 부대표 지정과 관리자 권한은 대표만 바꿀 수 있습니다."}
      </p>

      <div className="org-stats">
        <button className={`org-stat ${filter === "ALL" ? "is-active" : ""}`} onClick={() => setFilter("ALL")}>
          <span>전체</span>
          <strong>{counts.all}</strong>
        </button>
        <button className={`org-stat ${filter === "PENDING" ? "is-active" : ""}`} onClick={() => setFilter("PENDING")}>
          <span>승인 대기</span>
          <strong className={counts.pending ? "org-warn" : ""}>{counts.pending}</strong>
        </button>
        <button className={`org-stat ${filter === "MANAGERS" ? "is-active" : ""}`} onClick={() => setFilter("MANAGERS")}>
          <span>관리자·대표</span>
          <strong>{counts.managers}</strong>
        </button>
        <input
          className="org-search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="이름, 아이디, 부서 검색"
        />
      </div>

      {error && <div className="org-alert org-alert--error">{error}</div>}
      {notice && <div className="org-alert org-alert--ok">{notice}</div>}

      <div className="org-table-wrap">
        <table className="org-table">
          <thead>
            <tr>
              <th>이름 / 아이디</th>
              <th>부서</th>
              <th>상태</th>
              <th>직책</th>
              <th>시스템 권한</th>
              <th>가입 처리</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 && (
              <tr>
                <td colSpan={6} className="org-empty">
                  불러오는 중...
                </td>
              </tr>
            )}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="org-empty">
                  해당하는 직원이 없습니다.
                </td>
              </tr>
            )}
            {shown.map((u) => {
              const self = u.id === me.id;
              const isCeoRow = u.role === "SUPER_ADMIN";
              const isSystemAdmin = u.position === null;
              const busy = busyId === u.id;
              const positionLocked = self || isCeoRow || isSystemAdmin || (u.position === "VICE_CEO" && !isCeo);
              const options = ASSIGNABLE_POSITIONS.filter((p) => isCeo || !p.ceoOnly || p.value === u.position);

              return (
                <tr key={u.id} className={u.status === "PENDING" ? "is-pending" : ""}>
                  <td>
                    <strong>{u.name}</strong>
                    {self && <span className="org-me">나</span>}
                    <small>{u.loginId}</small>
                  </td>
                  <td>{u.department ?? "-"}</td>
                  <td>
                    <span className={`org-badge org-badge--${u.status.toLowerCase()}`}>{STATUS_LABEL[u.status]}</span>
                  </td>
                  <td>
                    {positionLocked ? (
                      <span className="org-fixed">{isSystemAdmin ? "시스템 관리자" : u.positionLabel}</span>
                    ) : (
                      <select
                        aria-label={`${u.name} 직책`}
                        value={u.position ?? "STAFF"}
                        disabled={busy}
                        onChange={(e) => changePosition(u, e.target.value as Position)}
                      >
                        {options.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {isCeo && !isCeoRow && !self && u.status === "ACTIVE" ? (
                      <select
                        aria-label={`${u.name} 권한`}
                        value={u.role}
                        disabled={busy}
                        onChange={(e) => changeRole(u, e.target.value as "USER" | "ADMIN")}
                      >
                        <option value="USER">{ROLE_LABEL.USER}</option>
                        <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
                      </select>
                    ) : (
                      <span className={`org-role org-role--${u.role.toLowerCase()}`}>{ROLE_LABEL[u.role]}</span>
                    )}
                  </td>
                  <td>
                    {u.status === "PENDING" ? (
                      <span className="org-actions">
                        <button className="org-btn org-btn--primary" disabled={busy} onClick={() => decide(u, true)}>
                          승인
                        </button>
                        <button className="org-btn" disabled={busy} onClick={() => decide(u, false)}>
                          거절
                        </button>
                      </span>
                    ) : (
                      <span className="org-muted">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
