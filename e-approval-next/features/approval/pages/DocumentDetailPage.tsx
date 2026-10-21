import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { documentApi } from '../api'
import ApprovalStampTable from '../components/ApprovalStampTable'
import StatusBadge from '../components/StatusBadge'
import type { DocumentDetail } from '../types'
import { formatBytes, formatDate, formatDateTime, formatMoney, leaveDays } from '../utils'

/** 결재 문서 상세 (/documents/:id) */
export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const docId = Number(id)
  const router = useRouter()

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState('')

  useEffect(() => {
    setDoc(null)
    setError('')
    documentApi
      .detail(docId)
      .then(setDoc)
      .catch((e: Error) => setError(e.message))
  }, [docId])

  const withdraw = async () => {
    if (!window.confirm('상신을 회수하면 임시저장 상태로 돌아갑니다. 회수할까요?')) return
    setBusy(true)
    try {
      setDoc(await documentApi.withdraw(docId))
      setNotice('회수되었습니다. 수정 후 다시 상신할 수 있습니다.')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '회수에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const decide = async (approve: boolean) => {
    const text = comment.trim()
    if (!approve && !text) {
      setError('반려 사유를 입력하세요.')
      return
    }
    if (!window.confirm(approve ? '이 문서를 승인할까요?' : '이 문서를 반려할까요?')) return
    setBusy(true)
    try {
      setDoc(await documentApi[approve ? 'approve' : 'reject'](docId, text))
      setComment('')
      setNotice(approve ? '승인했습니다.' : '반려했습니다.')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    setBusy(true)
    try {
      const draft = await documentApi.copy(docId)
      router.push(`/documents/${draft.id}/edit`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '복사에 실패했습니다.')
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('이 문서를 삭제할까요? 삭제한 문서는 되돌릴 수 없습니다.')) return
    setBusy(true)
    try {
      await documentApi.remove(docId)
      router.replace('/documents')
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
      setBusy(false)
    }
  }

  if (error && !doc) {
    return (
      <div className="apv-page">
        <div className="apv-alert apv-alert--error">{error}</div>
        <Link href="/documents">← 목록으로</Link>
      </div>
    )
  }
  if (!doc) return <div className="apv-page apv-center">불러오는 중...</div>

  const leaveHalf = doc.leaveType === 'HALF_AM' || doc.leaveType === 'HALF_PM'
  const comments = doc.approvalLines.filter((l) => l.comment)

  return (
    <div className="apv-page">
      <nav className="apv-breadcrumb apv-no-print">
        <Link href="/">홈</Link> › <Link href="/documents">전자결재</Link> › 문서 보기
      </nav>

      {notice && <div className="apv-alert apv-alert--info apv-no-print">{notice}</div>}
      {error && <div className="apv-alert apv-alert--error apv-no-print">{error}</div>}

      <div className="apv-detail-toolbar apv-no-print">
        <Link href="/documents" className="apv-btn apv-btn--ghost">
          ← 목록
        </Link>
        <div className="apv-action-bar-right">
          {doc.permissions.canWithdraw && (
            <button className="apv-btn apv-btn--secondary" onClick={withdraw} disabled={busy}>
              회수
            </button>
          )}
          {doc.permissions.canDelete && (
            <button className="apv-btn apv-btn--danger" onClick={remove} disabled={busy}>
              삭제
            </button>
          )}
          {doc.permissions.canCopy && (
            <button className="apv-btn apv-btn--secondary" onClick={copy} disabled={busy}>
              다시 작성
            </button>
          )}
          {doc.permissions.canEdit && (
            <Link href={`/documents/${doc.id}/edit`} className="apv-btn apv-btn--primary">
              수정 / 상신
            </Link>
          )}
          <button className="apv-btn apv-btn--ghost" onClick={() => window.print()}>
            인쇄
          </button>
        </div>
      </div>

      {doc.permissions.canDecide && (
        <section className="apv-decision apv-no-print" aria-label="결재 처리">
          <label htmlFor="apv-decision-comment">결재 의견</label>
          <textarea
            id="apv-decision-comment"
            value={comment}
            maxLength={500}
            rows={3}
            placeholder="승인 시 선택, 반려 시 필수"
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="apv-decision-actions">
            <span className="apv-muted">{comment.length}/500</span>
            <button className="apv-btn apv-btn--secondary" onClick={() => decide(false)} disabled={busy}>
              반려
            </button>
            <button className="apv-btn apv-btn--primary" onClick={() => decide(true)} disabled={busy}>
              승인
            </button>
          </div>
        </section>
      )}

      {/* 종이 문서 모양 */}
      <article className="apv-paper">
        <header className="apv-paper-header">
          <h1 className="apv-paper-title">{doc.typeLabel.split('').join(' ')}</h1>
          <ApprovalStampTable
            writer={doc.writer}
            submittedAt={doc.submittedAt}
            status={doc.status}
            lines={doc.approvalLines}
          />
        </header>

        <table className="apv-info-table">
          <tbody>
            <tr>
              <th>문서번호</th>
              <td>{doc.docNumber ?? '(상신 시 발급)'}</td>
              <th>상태</th>
              <td>
                <StatusBadge status={doc.status} />
              </td>
            </tr>
            <tr>
              <th>기안자</th>
              <td>
                {doc.writer.name} ({doc.writer.positionLabel})
              </td>
              <th>기안부서</th>
              <td>{doc.writer.department ?? '-'}</td>
            </tr>
            <tr>
              <th>작성일</th>
              <td>{formatDate(doc.createdAt)}</td>
              <th>상신일</th>
              <td>{formatDateTime(doc.submittedAt)}</td>
            </tr>

            {doc.type === 'EXPENSE' && (
              <>
                <tr>
                  <th>지출 금액</th>
                  <td className="apv-strong">{formatMoney(doc.amount)}</td>
                  <th>지출 항목</th>
                  <td>{doc.expenseCategoryLabel ?? '-'}</td>
                </tr>
                <tr>
                  <th>지출일</th>
                  <td colSpan={3}>{formatDate(doc.expenseDate)}</td>
                </tr>
              </>
            )}

            {doc.type === 'LEAVE' && (
              <tr>
                <th>휴가 종류</th>
                <td>{doc.leaveTypeLabel ?? '-'}</td>
                <th>휴가 기간</th>
                <td>
                  {formatDate(doc.leaveStartDate)}
                  {!leaveHalf && <> ~ {formatDate(doc.leaveEndDate)}</>}
                  {(() => {
                    const d = leaveDays(doc.leaveStartDate, doc.leaveEndDate, leaveHalf)
                    return d != null ? ` (${d}일)` : ''
                  })()}
                </td>
              </tr>
            )}

            <tr>
              <th>제목</th>
              <td colSpan={3} className="apv-strong">
                {doc.title}
              </td>
            </tr>
          </tbody>
        </table>

        <section className="apv-paper-body">{doc.content || <span className="apv-muted">(내용 없음)</span>}</section>

        <section className="apv-paper-section">
          <h3>첨부파일 ({doc.attachments.length})</h3>
          {doc.attachments.length === 0 ? (
            <p className="apv-muted">첨부파일이 없습니다.</p>
          ) : (
            <ul className="apv-file-list">
              {doc.attachments.map((a) => (
                <li key={a.id}>
                  <a className="apv-file-name" href={documentApi.attachmentUrl(doc.id, a.id)} download>
                    {a.originalName}
                  </a>
                  <span className="apv-file-size">{formatBytes(a.size)}</span>
                  <code className="apv-hash" title={`SHA-256: ${a.sha256}`}>
                    SHA-256 {a.sha256.slice(0, 12)}…
                  </code>
                </li>
              ))}
            </ul>
          )}
        </section>

        {comments.length > 0 && (
          <section className="apv-paper-section">
            <h3>결재 의견</h3>
            <ul className="apv-comment-list">
              {comments.map((l) => (
                <li key={l.stepOrder}>
                  <strong>
                    {l.approver.name} {l.approver.positionLabel}
                  </strong>
                  <span className={`apv-comment-status apv-comment-status--${l.status.toLowerCase()}`}>
                    {l.statusLabel}
                  </span>
                  <span className="apv-muted">{formatDateTime(l.actedAt)}</span>
                  <p>{l.comment}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  )
}
