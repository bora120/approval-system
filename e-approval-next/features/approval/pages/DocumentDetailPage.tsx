import { useCallback, useEffect, useState } from 'react'
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
import type { DocumentDetail, SignatureVerification } from '../types'
import { formatBytes, formatDate, formatDateTime, formatMoney, leaveDays } from '../utils'

/**
 * 결재 문서 보기 (/documents/:id) — 한 화면 뷰어
 *  - 결재란(✔/✖ 검증 표시) · 본문 · 첨부 · 전자서명 내역 · 결재 의견을 종이 문서 한 장에 모두 보여준다
 *  - 인증서·서명 원문 상세는 그 자리에서 펼쳐 보고, 다른 화면으로 이동하지 않는다
 *  - 인쇄 / PDF로 저장 / 서명 원본(.json) 저장
 */
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

  // 전자서명 검증 결과 (결재란 ✔/✖ · 서명 내역 표 · 인쇄 꼬리말이 함께 사용)
  const [verification, setVerification] = useState<SignatureVerification | null>(null)
  const [verifyError, setVerifyError] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    setDoc(null)
    setError('')
    documentApi
      .detail(docId)
      .then(setDoc)
      .catch((e: Error) => setError(e.message))
  }, [docId])

  const verify = useCallback(async () => {
    setVerifying(true)
    try {
      setVerification(await documentApi.signatures(docId))
      setVerifyError('')
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : '서명 검증에 실패했습니다.')
    } finally {
      setVerifying(false)
    }
  }, [docId])

  // 문서가 바뀔 때마다(상신·결재 직후 포함) 다시 검증
  const isDraft = doc?.status === 'DRAFT'
  const updatedAt = doc?.updatedAt
  useEffect(() => {
    if (updatedAt && !isDraft) void verify()
    if (isDraft) setVerification(null)
  }, [updatedAt, isDraft, verify])

  /** 인쇄 · PDF 저장: 파일 이름이 문서번호로 나오도록 잠깐 제목을 바꾼다 */
  const print = () => {
    const original = document.title
    if (doc) document.title = `${doc.docNumber ?? '임시저장'}_${doc.title}`
    const restore = () => {
      document.title = original
      window.removeEventListener('afterprint', restore)
    }
    window.addEventListener('afterprint', restore)
    window.print()
  }

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

  /** 인증서 확인 → 서명 창 (인증 전: 암호 입력 / 인증 후: 확인만). 서명·전송은 onSign 에서 */
  const startSigning = async (
    open: (ready: NonNullable<Awaited<ReturnType<typeof signer.prepare>>>) => Promise<void>,
  ) => {
    setBusy(true)
    setError('')
    try {
      const ready = await signer.prepare()
      if (ready) await open(ready)
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
        description: `「${doc.title}」 문서를 상신합니다. 문서 내용에 기안자 전자서명을 합니다.`,
        confirmLabel: '서명 후 상신',
        onSign: async (record, auth) => {
          const sig = await signDocumentAction({ record, ...auth, documentId: doc.id, signing, action: 'SUBMIT', comment: null })
          setDoc(await documentApi.submit(doc.id, sig))
          window.dispatchEvent(new Event('approval-inbox-updated'))
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
        description: `${doc.docNumber ?? ''} 「${doc.title}」 문서를 ${approve ? '승인' : '반려'}합니다. 문서 내용·결재 의견·앞선 서명에 이어서 전자서명합니다.${opinion ? `\n의견: ${opinion}` : ''}`,
        confirmLabel: approve ? '서명 후 승인' : '서명 후 반려',
        onSign: async (record, auth) => {
          const sig = await signDocumentAction({
            record,
            ...auth,
            documentId: doc.id,
            signing,
            action: approve ? 'APPROVE' : 'REJECT',
            comment: opinion,
          })
          const payload = { comment: opinion, ...sig }
          setDoc(await (approve ? documentApi.approve(docId, payload) : documentApi.reject(docId, payload)))
          setComment('')
          window.dispatchEvent(new Event('approval-inbox-updated')) // 헤더 결재함 배지 즉시 갱신
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
  const current = doc.approvalLines.find((l) => l.status === 'CURRENT')
  const documentHash = verification?.documentHash

  return (
    <div className="apv-page apv-viewer">
      <nav className="apv-breadcrumb apv-no-print">
        <Link href="/">홈</Link> › <Link href="/documents">전자결재</Link> › 문서 보기
      </nav>

      {notice && <div className="apv-alert apv-alert--info apv-no-print">{notice}</div>}
      {error && <div className="apv-alert apv-alert--error apv-no-print">{error}</div>}
      {signer.problem}
      {signer.dialog}

      {/* 한 줄 요약: 상태 · 지금 누구 차례인지 · 전자서명 검증 결과 */}
      <div className={`apv-summary apv-no-print ${doc.integrity === 'INVALID' ? 'is-fail' : ''}`}>
        <StatusBadge status={doc.status} />
        <span className="apv-summary-item">
          {doc.status === 'IN_PROGRESS' && current
            ? `결재 차례: ${current.approver.name} ${current.approver.positionLabel} (${current.stepOrder}/${doc.approvalLines.length})`
            : doc.status === 'DRAFT'
              ? '임시저장 — 전자서명 후 상신하면 결재가 시작됩니다'
              : `결재 완료 ${formatDateTime(doc.completedAt)}`}
        </span>
        {doc.status !== 'DRAFT' && (
          <span className="apv-summary-item">
            <IntegrityBadge integrity={doc.integrity} label={doc.integrityLabel} />{' '}
            {doc.integrity === 'VALID' && '기안부터 지금까지 전자서명 모두 검증됨'}
            {doc.integrity === 'INVALID' && (doc.integrityDetail ?? '전자서명 검증 실패')}
            {doc.integrity === 'LEGACY' && '전자서명 도입 전 문서 (회수 후 다시 상신하면 서명됨)'}
          </span>
        )}
      </div>

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
          <span className="apv-toolbar-divider" />
          <button className="apv-btn apv-btn--ghost" onClick={print} title="종이로 인쇄">
            인쇄
          </button>
          <button
            className="apv-btn apv-btn--ghost"
            onClick={print}
            title="인쇄 창의 '대상(프린터)'에서 'PDF로 저장'을 고르세요"
          >
            PDF로 저장
          </button>
          {doc.status !== 'DRAFT' && (
            <a
              className="apv-btn apv-btn--ghost"
              href={documentApi.exportUrl(doc.id)}
              download
              title="문서 + 서명 사슬 + 서명자 인증서 + 루트 CA 를 담은 파일. 시스템 밖에서도 서명을 다시 검증할 수 있습니다."
            >
              서명 원본 저장
            </a>
          )}
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

      {/* 종이 문서 한 장 — 화면과 인쇄물이 같은 모양 */}
      <article className="apv-paper">
        <header className="apv-paper-header">
          <h1 className="apv-paper-title">{doc.typeLabel.split('').join(' ')}</h1>
          <ApprovalStampTable
            writer={doc.writer}
            submittedAt={doc.submittedAt}
            status={doc.status}
            lines={doc.approvalLines}
            writerSigned={doc.writerSigned}
            verification={verification}
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
          <section className="apv-paper-section apv-avoid-break">
            <h3>전자서명 내역 · 결재 의견</h3>
            <SignaturePanel
              data={verification}
              error={verifyError}
              loading={verifying}
              lines={doc.approvalLines}
              onReverify={() => void verify()}
            />
          </section>
        )}

        {/* 인쇄물에만 나오는 꼬리말: 원본 확인 정보 */}
        <footer className="apv-print-footer">
          <div>
            문서번호 {doc.docNumber ?? '-'} · 전자서명 검증 {verification?.integrityLabel ?? doc.integrityLabel}
            {verification && ` (${formatDateTime(verification.checkedAt)})`}
          </div>
          {documentHash && <div className="pki-mono pki-break">문서 SHA-256 {documentHash}</div>}
          <div>
            출력 {formatDateTime(new Date().toISOString())} · {user?.name ?? ''} — 본 문서는 전자결재 시스템에서 작성되고
            인증서로 전자서명된 문서의 사본입니다. 원본 확인은 시스템의 문서 보기 또는 서명 원본(.json)으로 합니다.
          </div>
        </footer>
      </article>
    </div>
  )
}
