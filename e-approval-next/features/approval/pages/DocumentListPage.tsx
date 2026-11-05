import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { documentApi } from '../api'
import IntegrityBadge from '../components/IntegrityBadge'
import StatusBadge from '../components/StatusBadge'
import type { DocumentStatus, DocumentSummary } from '../types'
import { DOCUMENT_TYPES, STATUS_TABS } from '../types'
import { formatDate } from '../utils'

type Tab = DocumentStatus | 'ALL' | 'INBOX' | 'DECIDED'

const VALID_TABS: Tab[] = ['ALL', 'DRAFT', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'INBOX', 'DECIDED']

/** 전자결재 문서함 (/documents?tab=INBOX 처럼 탭 지정 가능) */
export default function DocumentListPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as Tab | null
  const tab: Tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'ALL'

  const router = useRouter()

  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    let alive = true
    const request =
      tab === 'INBOX'
        ? documentApi.inbox()
        : tab === 'DECIDED'
          ? documentApi.decided()
          : documentApi.myDocuments(tab === 'ALL' ? undefined : tab)
    request
      .then((list) => alive && setDocs(list))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [tab])

  const changeTab = (t: Tab) => router.push(t === 'ALL' ? '/documents' : `/documents?tab=${t}`)
  const isInbox = tab === 'INBOX'
  const isDecided = tab === 'DECIDED'
  const showWriter = isInbox || isDecided

  return (
    <div className="apv-page">
      <nav className="apv-breadcrumb">
        <Link href="/">홈</Link> › 전자결재
      </nav>

      <div className="apv-list-header">
        <h1 className="apv-title">전자결재</h1>
        <div className="apv-new-buttons">
          {DOCUMENT_TYPES.map((t) => (
            <Link key={t.value} href={`/documents/new?type=${t.value}`} className="apv-btn apv-btn--ghost apv-btn--sm">
              {t.label}
            </Link>
          ))}
          <Link href="/documents/new" className="apv-btn apv-btn--primary">
            + 새 문서
          </Link>
        </div>
      </div>

      <div className="apv-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={isInbox}
          className={`apv-tab apv-tab--inbox ${isInbox ? 'is-active' : ''}`}
          onClick={() => changeTab('INBOX')}
        >
          결재할 문서
        </button>
        <button
          role="tab"
          aria-selected={isDecided}
          className={`apv-tab apv-tab--inbox ${isDecided ? 'is-active' : ''}`}
          onClick={() => changeTab('DECIDED')}
        >
          결재한 문서
        </button>
        <span className="apv-tab-divider" />
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className={`apv-tab ${tab === t.value ? 'is-active' : ''}`}
            onClick={() => changeTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="apv-alert apv-alert--error">{error}</div>}

      <div className="apv-card apv-card--flush">
        {loading ? (
          <div className="apv-center">불러오는 중...</div>
        ) : docs.length === 0 ? (
          <div className="apv-empty">
            {isInbox ? '결재할 차례인 문서가 없습니다.' : isDecided ? '결재한 문서가 없습니다.' : '문서가 없습니다.'}
            {!showWriter && (
              <div>
                <Link href="/documents/new">첫 문서 작성하기 →</Link>
              </div>
            )}
          </div>
        ) : (
          <div className="apv-table-wrap">
            <table className="apv-table">
              <thead>
                <tr>
                  <th>문서번호</th>
                  <th>종류</th>
                  <th className="apv-col-title">제목</th>
                  {showWriter && <th>기안자</th>}
                  <th>상태</th>
                  <th>전자서명</th>
                  <th>현재 결재자</th>
                  <th>{showWriter ? '상신일' : '작성일'}</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} onClick={() => router.push(`/documents/${d.id}`)} className="apv-row-link">
                    <td className="apv-mono">{d.docNumber ?? '-'}</td>
                    <td>{d.typeLabel}</td>
                    <td className="apv-col-title">
                      <Link href={`/documents/${d.id}`} onClick={(e) => e.stopPropagation()}>
                        {d.title || '(제목 없음)'}
                      </Link>
                      {d.attachmentCount > 0 && <span className="apv-clip"> · 첨부 {d.attachmentCount}</span>}
                    </td>
                    {showWriter && (
                      <td>
                        {d.writerName}
                        <small className="apv-muted"> {d.writerDepartment}</small>
                      </td>
                    )}
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td>
                      {d.status === 'DRAFT' ? '-' : <IntegrityBadge integrity={d.integrity} label={d.integrityLabel} />}
                    </td>
                    <td>{d.currentApproverName ?? '-'}</td>
                    <td>{formatDate(showWriter ? d.submittedAt : d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
