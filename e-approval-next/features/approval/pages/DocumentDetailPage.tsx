import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { useAuthState } from '@/lib/auth'
import { signDocumentAction } from '@/features/pki/certificate'
import { useCertificateSigner } from '@/features/pki/useCertificateSigner'
import { documentApi } from '../api'
import ApprovalStampTable from '../components/ApprovalStampTable'
import IntegrityBadge from '../components/IntegrityBadge'
import SignaturePanel from '../components/SignaturePanel'
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
  const { user } = useAuthState()
  const signer = useCertificateSigner(user?.loginId)

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

  /** 인증서 확인 → 인증서 암호 입력 창. 서명·전송은 onSign 에서 */
  const startSigning = async (open: (ready: NonNullable<Awaited<ReturnType<typeof signer.prepare>>>) => void) => {
    setBusy(true)
    setError('')
    try {
      const ready = await signer.prepare()
      if (ready) open(ready)
    } catch (e) {
      setError(e instanceof Error ? e.message : '인증서 정보를 불러오지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 기안자: 임시저장 문서를 전자서명해서 상신 */
  const submit = () => {
    const signing = doc?.signing
    if (!doc || !signing) return
    void startSigning((ready) =>
      signer.open(ready, {
        title: '전자서명 후 상신',
        description: `「${doc.title}」 문서를 상신합니다. 인증서 암호를 입력하면 문서 내용에 기안자 전자서명을 합니다.`,
        confirmLabel: '서명 후 상신',
        onSign: async (record, certPassword) => {
          const sig = await signDocumentAction({ record, certPassword, documentId: doc.id, signing, action: 'SUBMIT', comment: null })
          setDoc(await documentApi.submit(doc.id, sig))
          setNotice('기안자 전자서명 후 상신했습니다.')
        },
      }),
    )
  }

  /** 결재자: 승인/반려 = 서명 사슬에 내 서명 추가 */
  const decide = (approve: boolean) => {
    const text = comment.trim()
    if (!approve && !text) {
      setError('반려 사유를 입력하세요.')
      return
    }
    const signing = doc?.signing
    if (!doc || !signing) {
      setError('결재 정보를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.')
      return
    }
    const opinion = text || null
    void startSigning((ready) =>
      signer.open(ready, {
        title: approve ? '전자서명 후 승인' : '전자서명 후 반려',
        description: `${doc.docNumber ?? ''} 「${doc.title}」 문서를 ${approve ? '승인' : '반려'}합니다. 인증서 암호를 입력하면 문서 내용·결재 의견·앞선 서명에 이어서 전자서명합니다.`,
        confirmLabel: approve ? '서명 후 승인' : '서명 후 반려',
        onSign: async (record, certPassword) => {
          const sig = await signDocumentAction({
            record,
            certPassword,
            documentId: doc.id,
            signing,
            action: approve ? 'APPROVE' : 'REJECT',
            comment: opinion,
          })
          const payload = { comment: opinion, ...sig }
          setDoc(await (approve ? documentApi.approve(docId, payload) : documentApi.reject(docId, payload)))
          setComment('')
          setNotice(approve ? '전자서명 후 승인했습니다.' : '전자서명 후 반려했습니다.')
        },
      }),
    )
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
      {signer.problem}
      {signer.dialog}

      {/* 서명 사슬 자동 검증 결과 (문서를 열 때마다 서버가 다시 검증) */}
      {doc.status !== 'DRAFT' && (
        <div
          className={`apv-alert apv-no-print ${doc.integrity === 'INVALID' ? 'apv-alert--error' : 'apv-alert--info'}`}
        >
          <IntegrityBadge integrity={doc.integrity} label={doc.integrityLabel} />{' '}
          {doc.integrity === 'VALID' && '기안자부터 지금까지의 전자서명이 모두 검증됐습니다.'}
          {doc.integrity === 'INVALID' && (doc.integrityDetail ?? '전자서명 검증에 실패했습니다.')}
          {doc.integrity === 'LEGACY' && '전자서명 도입 전에 상신된 문서입니다. 회수 후 다시 상신하면 서명됩니다.'}
          {doc.integrityCheckedAt && <span className="apv-muted"> · {formatDateTime(doc.integrityCheckedAt)} 확인</span>}
        </div>
      )}

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
            <Link href={`/documents/${doc.id}/edit`} className="apv-btn apv-btn--secondary">
              수정
            </Link>
          )}
          {doc.permissions.canSubmit && doc.signing && (
            <button className="apv-btn apv-btn--primary" onClick={submit} disabled={busy}>
              전자서명 후 상신
            </button>
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
            writerSigned={doc.writerSigned}
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

        {doc.status !== 'DRAFT' && (
          <section className="apv-paper-section">
            <h3>전자서명 검증 (서명 사슬)</h3>
            <SignaturePanel documentId={doc.id} refreshKey={doc.updatedAt} />
          </section>
        )}

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
