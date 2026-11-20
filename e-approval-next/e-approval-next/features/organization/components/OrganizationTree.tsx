'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthState } from '@/lib/auth'
import { organizationApi, type OrganizationMember, type Position } from '../api'

/** 직급 순서 (높을수록 앞) */
const RANK: Record<Position, number> = {
  CEO: 8,
  VICE_CEO: 7,
  GENERAL_MANAGER: 6,
  DEPUTY_GENERAL_MANAGER: 5,
  MANAGER: 4,
  ASSISTANT_MANAGER: 3,
  JUNIOR: 2,
  STAFF: 1,
}
const isExecutive = (m: OrganizationMember) => m.position === 'CEO' || m.position === 'VICE_CEO'
const byRank = (a: OrganizationMember, b: OrganizationMember) =>
  (RANK[b.position] ?? 0) - (RANK[a.position] ?? 0) || a.name.localeCompare(b.name, 'ko')

const ALL = '전체'

interface Department {
  name: string
  people: OrganizationMember[] // 직급 높은 순
}

/**
 * 홈 화면 조직도 (트리)
 *  - 전체 : 대표 → 부대표 → 부서 (부서 칸에 인원수·책임자, 누르면 그 부서 탭으로)
 *  - 부서 : 부서 → 구성원 (직급 높은 순)
 * 대표·부대표는 맨 위에만 나오고, 부서 목록과 인원수에서는 빠진다.
 */
export default function OrganizationTree() {
  const { isLoggedIn, loading: authLoading } = useAuthState()

  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(ALL)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 조직도 데이터 조회
  useEffect(() => {
    if (authLoading || !isLoggedIn) return
    let active = true
    setLoading(true)
    organizationApi
      .directory()
      .then((data) => {
        if (!active) return
        setMembers(data)
        setError('')
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '조직도를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [authLoading, isLoggedIn])

  const ceo = useMemo(() => members.filter((m) => m.position === 'CEO').sort(byRank), [members])
  const viceCeo = useMemo(() => members.filter((m) => m.position === 'VICE_CEO').sort(byRank), [members])

  // 부서별 구성원 (대표·부대표 제외)
  const departments = useMemo<Department[]>(() => {
    const grouped = new Map<string, OrganizationMember[]>()
    for (const m of members) {
      if (isExecutive(m)) continue
      const name = m.department?.trim() || '미지정 부서'
      grouped.set(name, [...(grouped.get(name) ?? []), m])
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([name, people]) => ({ name, people: [...people].sort(byRank) }))
  }, [members])

  // 트리가 화면보다 넓으면(폰) 가운데(대표)부터 보이게 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [selected, members])

  if (authLoading || !isLoggedIn) return null

  const current = departments.find((d) => d.name === selected)

  return (
    <section className="organization-tree-section" aria-labelledby="organization-tree-title">
      {/* 조직도 제목 */}
      <div className="organization-tree-heading">
        <div>
          <span className="organization-tree-eyebrow">OUR ORGANIZATION</span>
          <h2 id="organization-tree-title">조직도</h2>
          <p>부서별 구성원과 직급을 확인할 수 있어요.</p>
        </div>
        <span className="organization-tree-count">구성원 {members.length}명</span>
      </div>

      {loading && <p className="organization-tree-message">조직도를 불러오는 중...</p>}
      {error && (
        <p className="organization-tree-message is-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && members.length === 0 && (
        <p className="organization-tree-message">표시할 조직 정보가 없습니다.</p>
      )}

      {!loading && !error && members.length > 0 && (
        <>
          {/* 부서 선택 탭 */}
          <div className="organization-department-tabs" role="tablist" aria-label="부서별 조직도">
            {[ALL, ...departments.map((d) => d.name)].map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={selected === name}
                className={`organization-department-tab ${selected === name ? 'is-active' : ''}`}
                onClick={() => setSelected(name)}
              >
                {name}
                <span>{name === ALL ? members.length : departments.find((d) => d.name === name)?.people.length ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="otree-scroll" ref={scrollRef}>
            {current ? (
              <DepartmentTree department={current} />
            ) : (
              <CompanyTree ceo={ceo} viceCeo={viceCeo} departments={departments} onSelect={setSelected} />
            )}
          </div>
        </>
      )}
    </section>
  )
}

/** 전체: 대표 → 부대표 → 부서 */
function CompanyTree({
  ceo,
  viceCeo,
  departments,
  onSelect,
}: {
  ceo: OrganizationMember[]
  viceCeo: OrganizationMember[]
  departments: Department[]
  onSelect: (name: string) => void
}) {
  const deptLevel = departments.length > 0 && (
    <ul>
      {departments.map((d) => (
        <li key={d.name}>
          <button type="button" className="otree-node otree-node--dept" onClick={() => onSelect(d.name)}>
            <strong>{d.name}</strong>
            <span className="otree-sub">
              {d.people[0] ? `${d.people[0].positionLabel} ${d.people[0].name}` : '-'} · {d.people.length}명
            </span>
          </button>
        </li>
      ))}
    </ul>
  )

  const viceLevel =
    viceCeo.length > 0 ? (
      <ul>
        <li>
          <div className="otree-node otree-node--exec">
            <span className="otree-rank">부대표</span>
            <strong>{viceCeo.map((m) => m.name).join(', ')}</strong>
          </div>
          {deptLevel}
        </li>
      </ul>
    ) : (
      deptLevel
    )

  return (
    <div className="otree" aria-label="대표, 부대표, 부서 조직도">
      <ul>
        <li>
          <div className="otree-node otree-node--root">
            <span className="otree-rank">대표</span>
            <strong>{ceo.length > 0 ? ceo.map((m) => m.name).join(', ') : '공석'}</strong>
          </div>
          {viceLevel}
        </li>
      </ul>
    </div>
  )
}

/** 부서: 부서 → 구성원 (직급 높은 순) */
function DepartmentTree({ department }: { department: Department }) {
  return (
    <div className="otree" aria-label={`${department.name} 조직도`}>
      <ul>
        <li>
          <div className="otree-node otree-node--root">
            <span className="otree-rank">부서</span>
            <strong>{department.name}</strong>
            <span className="otree-sub">{department.people.length}명</span>
          </div>
          <ul>
            {department.people.map((m) => (
              <li key={m.id}>
                <div className="otree-node">
                  <span className="otree-rank">{m.positionLabel}</span>
                  <strong>{m.name}</strong>
                </div>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </div>
  )
}
