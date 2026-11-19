"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { organizationApi, type OrganizationMember } from "../api";

const POSITION_ORDER = [
  "사원", "주임", "대리", "과장", "차장", "부장", "부대표", "대표",
];

export default function OrganizationTree() {
  const { isLoggedIn, loading: authLoading } = useAuthState();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("전체");

  useEffect(() => {
    if (authLoading || !isLoggedIn) return;
    let active = true;
    setLoading(true);
    organizationApi.directory()
      .then((data) => { if (active) { setMembers(data); setError(""); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "조직도를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authLoading, isLoggedIn]);

  const departments = useMemo(() => {
    const grouped = new Map<string, OrganizationMember[]>();
    for (const member of members) {
      const name = member.department?.trim() || "미지정 부서";
      const list = grouped.get(name) ?? [];
      list.push(member);
      grouped.set(name, list);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([name, people]) => ({
      name,
      people: people.sort((a, b) => {
        const rank = POSITION_ORDER.indexOf(b.positionLabel) - POSITION_ORDER.indexOf(a.positionLabel);
        return rank || a.name.localeCompare(b.name, "ko");
      }),
    }));
  }, [members]);

  const visibleDepartments = selectedDepartment === "전체"
    ? departments
    : departments.filter((department) => department.name === selectedDepartment);

  if (authLoading || !isLoggedIn) return null;

  return (
    <section className="organization-tree-section" aria-labelledby="organization-tree-title">
      <div className="organization-tree-heading">
        <div>
          <span className="organization-tree-eyebrow">OUR ORGANIZATION</span>
          <h2 id="organization-tree-title">조직도</h2>
          <p>부서별 구성원과 직급을 확인할 수 있어요.</p>
        </div>
        <span className="organization-tree-count">구성원 {members.length}명</span>
      </div>

      {loading ? <p className="organization-tree-message">조직도를 불러오는 중...</p> : null}
      {error ? <p className="organization-tree-message is-error" role="alert">{error}</p> : null}
      {!loading && !error && departments.length === 0 ? (
        <p className="organization-tree-message">표시할 조직 정보가 없습니다.</p>
      ) : null}

      {!loading && !error && departments.length > 0 && (
        <>
          <div className="organization-department-tabs" role="tablist" aria-label="부서별 조직도">
            {["전체", ...departments.map((department) => department.name)].map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={selectedDepartment === name}
                className={`organization-department-tab ${selectedDepartment === name ? "is-active" : ""}`}
                onClick={() => setSelectedDepartment(name)}
              >
                {name}
                <span>{name === "전체" ? members.length : departments.find((d) => d.name === name)?.people.length ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="organization-tree-grid">
          {visibleDepartments.map((department) => (
            <section className="organization-department" key={department.name}>
              <div className="organization-department-title">
                <span className="organization-department-mark" aria-hidden="true" />
                <h3>{department.name}</h3>
                <span>{department.people.length}명</span>
              </div>
              <ol className="organization-member-tree">
                {department.people.map((member, index) => (
                  <li className="organization-member-node" key={member.id}>
                    <span className="organization-member-connector" aria-hidden="true" />
                    <div className="organization-member-card">
                      <span className="organization-member-rank">{member.positionLabel}</span>
                      <strong>{member.name}</strong>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          </div>
        </>
      )}
    </section>
  );
}
