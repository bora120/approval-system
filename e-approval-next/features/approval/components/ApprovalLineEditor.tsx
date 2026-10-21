import { useEffect, useRef, useState } from 'react'
import { approvalLineApi } from '../api'
import type { Approver } from '../types'
import { MAX_APPROVERS } from '../types'

interface Props {
  writer: { name: string; positionLabel: string; department: string | null }
  approvers: Approver[]
  onChange: (approvers: Approver[]) => void
}

/**
 * 결재선 편집기
 * - 기안자 → 결재자1 → 결재자2 ... 순서로 표시
 * - 검색해서 추가, ▲▼로 순서 변경, ✕로 삭제, "기본 결재선"으로 초기화
 */
export default function ApprovalLineEditor({ writer, approvers, onChange }: Props) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<Approver[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  // 검색어 입력 후 0.25초 뒤에 검색 (입력할 때마다 요청하지 않도록)
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      approvalLineApi
        .search(keyword)
        .then(setResults)
        .catch((e: Error) => setError(e.message))
    }, 250)
    return () => clearTimeout(timer)
  }, [keyword, open])

  // 바깥 클릭 시 검색 목록 닫기
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const selectedIds = new Set(approvers.map((a) => a.id))
  const candidates = results.filter((r) => !selectedIds.has(r.id))
  const full = approvers.length >= MAX_APPROVERS

  const add = (a: Approver) => {
    if (full) return
    onChange([...approvers, a])
    setKeyword('')
    setOpen(false)
  }

  const remove = (id: number) => onChange(approvers.filter((a) => a.id !== id))

  const move = (index: number, dir: -1 | 1) => {
    const next = [...approvers]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const loadDefault = async () => {
    setError('')
    try {
      onChange(await approvalLineApi.defaultLine())
    } catch (e) {
      setError(e instanceof Error ? e.message : '기본 결재선을 불러오지 못했습니다.')
    }
  }

  return (
    <div className="apv-line-editor">
      <ol className="apv-line-flow">
        <li className="apv-line-node apv-line-node--writer">
          <span className="apv-line-step">기안</span>
          <strong>{writer.name}</strong>
          <small>
            {writer.department} · {writer.positionLabel}
          </small>
        </li>

        {approvers.map((a, i) => (
          <li key={a.id} className="apv-line-node">
            <span className="apv-line-step">{i + 1}차 결재</span>
            <strong>{a.name}</strong>
            <small>
              {a.department} · {a.positionLabel}
            </small>
            <div className="apv-line-actions">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="앞으로">
                ◀
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === approvers.length - 1}
                aria-label="뒤로"
              >
                ▶
              </button>
              <button type="button" className="apv-danger-text" onClick={() => remove(a.id)} aria-label="삭제">
                ✕
              </button>
            </div>
          </li>
        ))}

        {approvers.length === 0 && <li className="apv-line-empty">결재자를 추가하세요</li>}
      </ol>

      <div className="apv-line-tools">
        <div className="apv-search" ref={boxRef}>
          <input
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={full ? `결재자는 최대 ${MAX_APPROVERS}명입니다` : '이름 또는 부서로 결재자 검색'}
            disabled={full}
          />
          {open && !full && (
            <ul className="apv-search-results">
              {candidates.length === 0 ? (
                <li className="apv-search-empty">검색 결과가 없습니다</li>
              ) : (
                candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => add(c)}>
                      <strong>{c.name}</strong>
                      <span>
                        {c.department} · {c.positionLabel}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <button type="button" className="apv-btn apv-btn--ghost" onClick={loadDefault}>
          기본 결재선
        </button>
      </div>
      {error && <p className="apv-field-error">{error}</p>}
    </div>
  )
}
