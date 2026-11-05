import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuthState } from '@/lib/auth'
import { signDocumentAction } from '@/features/pki/certificate'
import { useCertificateSigner } from '@/features/pki/useCertificateSigner'
import { approvalLineApi, documentApi } from '../api'
import ApprovalLineEditor from '../components/ApprovalLineEditor'
import AttachmentInput from '../components/AttachmentInput'
import type {
  Approver,
  AttachmentInfo,
  DocumentPayload,
  DocumentType,
  ExpenseCategory,
  LeaveType,
} from '../types'
import { DOCUMENT_TYPES, EXPENSE_CATEGORIES, LEAVE_TYPES, MAX_CONTENT, MAX_TITLE } from '../types'
import { formatMoney, leaveDays, today } from '../utils'

interface FormState {
  type: DocumentType
  title: string
  content: string
  amount: string // 숫자만 담은 문자열 (입력 중 편의를 위해)
  expenseDate: string
  expenseCategory: ExpenseCategory | ''
  leaveType: LeaveType | ''
  leaveStartDate: string
  leaveEndDate: string
}

const emptyForm = (type: DocumentType): FormState => ({
  type,
  title: '',
  content: '',
  amount: '',
  expenseDate: today(),
  expenseCategory: '',
  leaveType: '',
  leaveStartDate: '',
  leaveEndDate: '',
})

const CONTENT_PLACEHOLDER: Record<DocumentType, string> = {
  GENERAL: '기안 내용을 입력하세요.',
  EXPENSE: '지출 사유와 상세 내역을 입력하세요.\n예) 10/14 고객사 미팅 중 점심 식사 (3인)',
  LEAVE: '휴가 사유와 업무 인수인계 내용을 입력하세요.',
}

const GENERAL_TEMPLATE = `1. 목적
 - 

2. 내용
 - 

3. 기대 효과
 - 

4. 첨부
 - `

function isDocumentType(v: string | null): v is DocumentType {
  return v === 'GENERAL' || v === 'EXPENSE' || v === 'LEAVE'
}

/**
 * 결재 문서 작성 / 수정 화면
 *  - /documents/new            새 문서 (?type=EXPENSE 처럼 양식을 미리 고를 수 있음)
 *  - /documents/:id/edit       임시저장 문서 수정
 */
export default function DocumentWritePage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : undefined
  const editId = id ? Number(id) : null
  const searchParams = useSearchParams()
  const initialType = isDocumentType(searchParams.get('type')) ? (searchParams.get('type') as DocumentType) : 'GENERAL'

  const { user } = useAuthState()
  const router = useRouter()
  const signer = useCertificateSigner(user?.loginId)

  const [form, setForm] = useState<FormState>(emptyForm(initialType))
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [existing, setExisting] = useState<AttachmentInfo[]>([])
  const [removedIds, setRemovedIds] = useState<number[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [docNumber, setDocNumber] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)

  // ---------- 처음 불러오기 ----------
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDirty(false)
    setRemovedIds([])
    setNewFiles([])

    if (editId) {
      documentApi
        .detail(editId)
        .then((d) => {
          if (cancelled) return
          if (!d.permissions.canEdit) {
            router.replace(`/documents/${editId}`)
            return
          }
          setForm({
            type: d.type,
            title: d.title,
            content: d.content ?? '',
            amount: d.amount != null ? String(d.amount) : '',
            expenseDate: d.expenseDate ?? today(),
            expenseCategory: d.expenseCategory ?? '',
            leaveType: d.leaveType ?? '',
            leaveStartDate: d.leaveStartDate ?? '',
            leaveEndDate: d.leaveEndDate ?? '',
          })
          setApprovers(d.approvalLines.map((l) => l.approver))
          setExisting(d.attachments)
          setDocNumber(d.docNumber)
        })
        .catch((e: Error) => !cancelled && setError(e.message))
        .finally(() => !cancelled && setLoading(false))
    } else {
      setForm(emptyForm(initialType))
      setExisting([])
      setDocNumber(null)
      approvalLineApi
        .defaultLine()
        .then((line) => !cancelled && setApprovers(line))
        .catch(() => !cancelled && setApprovers([]))
        .finally(() => !cancelled && setLoading(false))
    }
    return () => {
      cancelled = true
    }
    // initialType 은 처음 진입 시에만 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  // ---------- 작성 중 페이지를 떠나려 하면 경고 ----------
  useEffect(() => {
    if (!dirty || saving) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, saving])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
    setError('')
  }

  const selectedLeave = LEAVE_TYPES.find((l) => l.value === form.leaveType)
  const days = useMemo(
    () => leaveDays(form.leaveStartDate || null, form.leaveEndDate || null, !!selectedLeave?.halfDay),
    [form.leaveStartDate, form.leaveEndDate, selectedLeave],
  )

  // ---------- 검증 (서버에서도 똑같이 다시 검사함) ----------
  const validate = (submit: boolean): string | null => {
    if (!form.title.trim()) return '제목을 입력하세요.'
    if (form.title.trim().length > MAX_TITLE) return `제목은 ${MAX_TITLE}자 이하로 입력하세요.`
    if (form.content.length > MAX_CONTENT) return `내용은 ${MAX_CONTENT}자 이하로 입력하세요.`
    if (form.leaveStartDate && form.leaveEndDate && form.leaveEndDate < form.leaveStartDate)
      return '휴가 종료일이 시작일보다 빠를 수 없습니다.'
    if (!submit) return null

    switch (form.type) {
      case 'GENERAL':
        if (!form.content.trim()) return '기안 내용을 입력하세요.'
        break
      case 'EXPENSE':
        if (!form.amount || Number(form.amount) <= 0) return '지출 금액을 입력하세요.'
        if (!form.expenseDate) return '지출일을 입력하세요.'
        if (!form.expenseCategory) return '지출 항목을 선택하세요.'
        if (!form.content.trim()) return '지출 사유를 입력하세요.'
        break
      case 'LEAVE':
        if (!form.leaveType) return '휴가 종류를 선택하세요.'
        if (!form.leaveStartDate || !form.leaveEndDate) return '휴가 기간을 입력하세요.'
        if (selectedLeave?.halfDay && form.leaveStartDate !== form.leaveEndDate)
          return '반차는 시작일과 종료일이 같아야 합니다.'
        break
    }
    if (approvers.length === 0) return '결재자를 1명 이상 지정하세요.'
    return null
  }

  const buildPayload = (): DocumentPayload => ({
    type: form.type,
    title: form.title.trim(),
    content: form.content.trim() || null,
    amount: form.type === 'EXPENSE' && form.amount ? Number(form.amount) : null,
    expenseDate: form.type === 'EXPENSE' ? form.expenseDate || null : null,
    expenseCategory: form.type === 'EXPENSE' ? form.expenseCategory || null : null,
    leaveType: form.type === 'LEAVE' ? form.leaveType || null : null,
    leaveStartDate: form.type === 'LEAVE' ? form.leaveStartDate || null : null,
    leaveEndDate: form.type === 'LEAVE' ? form.leaveEndDate || null : null,
    approverIds: approvers.map((a) => a.id),
    removedAttachmentIds: removedIds,
    submit: false,
  })

  /**
   * 임시저장: 저장만.
   * 상신: 인증서 확인 → 임시저장 → 인증서 암호 입력 → 기안자 전자서명 → 상신
   *       (서명을 취소하면 문서는 임시저장 상태로 남는다)
   */
  const save = async (submit: boolean) => {
    const problem = validate(submit)
    if (problem) {
      setError(problem)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (submit) {
      const names = approvers.map((a) => `${a.name} ${a.positionLabel}`).join(' → ')
      if (!window.confirm(`다음 순서로 상신합니다.\n\n${names}\n\n상신하면 기안자 전자서명이 붙고, 이후에는 내용을 수정할 수 없습니다. 계속할까요?`)) {
        return
      }
    }

    setError('')
    setSaving(submit ? 'submit' : 'draft')
    try {
      const ready = submit ? await signer.prepare() : null
      if (submit && !ready) return // 인증서가 없거나 이 브라우저에 개인키가 없음 → 안내 문구 표시

      const payload = buildPayload()
      const doc = editId
        ? await documentApi.update(editId, payload, newFiles)
        : await documentApi.create(payload, newFiles)
      setDirty(false)

      if (!ready || !doc.signing) {
        router.replace(`/documents/${doc.id}`)
        return
      }
      const signing = doc.signing
      signer.open(ready, {
        title: '전자서명 후 상신',
        description: `「${doc.title}」 문서를 상신합니다. 인증서 암호를 입력하면 문서 내용에 기안자 전자서명을 합니다.`,
        confirmLabel: '서명 후 상신',
        onSign: async (record, certPassword) => {
          const sig = await signDocumentAction({
            record,
            certPassword,
            documentId: doc.id,
            signing,
            action: 'SUBMIT',
            comment: null,
          })
          await documentApi.submit(doc.id, sig)
          router.replace(`/documents/${doc.id}`)
        },
        // 서명을 취소해도 내용은 임시저장되어 있음
        onCancel: () => router.replace(`/documents/${doc.id}`),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(null)
    }
  }

  const cancel = () => {
    if (dirty && !window.confirm('작성 중인 내용이 저장되지 않습니다. 나갈까요?')) return
    router.push(editId ? `/documents/${editId}` : '/documents')
  }

  if (!user) return null
  if (loading) return <div className="apv-page apv-center">불러오는 중...</div>

  return (
    <div className="apv-page">
      <nav className="apv-breadcrumb">
        <Link href="/">홈</Link> › <Link href="/documents">전자결재</Link> › {editId ? '문서 수정' : '새 문서 작성'}
      </nav>
      <h1 className="apv-title">
        {editId ? '문서 수정' : '새 결재 문서'}
        {docNumber && <span className="apv-title-sub">{docNumber}</span>}
      </h1>

      {error && <div className="apv-alert apv-alert--error">{error}</div>}
      {signer.problem}
      {signer.dialog}

      {/* 1. 양식 선택 */}
      <section className="apv-card">
        <h2 className="apv-card-title">문서 양식</h2>
        <div className="apv-type-grid">
          {DOCUMENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`apv-type-card ${form.type === t.value ? 'is-selected' : ''}`}
              onClick={() => update('type', t.value)}
            >
              <strong>{t.label}</strong>
              <small>{t.description}</small>
            </button>
          ))}
        </div>
      </section>

      {/* 2. 결재선 */}
      <section className="apv-card">
        <h2 className="apv-card-title">
          결재선 <span className="apv-required">*</span>
        </h2>
        <ApprovalLineEditor
          writer={user}
          approvers={approvers}
          onChange={(list) => {
            setApprovers(list)
            setDirty(true)
          }}
        />
      </section>

      {/* 3. 문서 정보 */}
      <section className="apv-card">
        <h2 className="apv-card-title">문서 정보</h2>

        <div className="apv-form-grid">
          <label className="apv-field apv-field--full">
            <span>
              제목 <span className="apv-required">*</span>
            </span>
            <input
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={MAX_TITLE}
              placeholder="제목을 입력하세요"
            />
          </label>

          <div className="apv-field">
            <span>기안자</span>
            <div className="apv-readonly">
              {user.name} ({user.department} · {user.positionLabel})
            </div>
          </div>
          <div className="apv-field">
            <span>작성일</span>
            <div className="apv-readonly">{today()}</div>
          </div>

          {form.type === 'EXPENSE' && (
            <>
              <label className="apv-field">
                <span>
                  지출 금액 <span className="apv-required">*</span>
                </span>
                <div className="apv-input-suffix">
                  <input
                    inputMode="numeric"
                    value={form.amount ? Number(form.amount).toLocaleString('ko-KR') : ''}
                    onChange={(e) => update('amount', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="0"
                  />
                  <em>원</em>
                </div>
              </label>
              <label className="apv-field">
                <span>
                  지출 항목 <span className="apv-required">*</span>
                </span>
                <select
                  value={form.expenseCategory}
                  onChange={(e) => update('expenseCategory', e.target.value as ExpenseCategory | '')}
                >
                  <option value="">선택</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="apv-field">
                <span>
                  지출일 <span className="apv-required">*</span>
                </span>
                <input type="date" value={form.expenseDate} onChange={(e) => update('expenseDate', e.target.value)} />
              </label>
              <div className="apv-field">
                <span>금액 확인</span>
                <div className="apv-readonly">{form.amount ? formatMoney(Number(form.amount)) : '-'}</div>
              </div>
            </>
          )}

          {form.type === 'LEAVE' && (
            <>
              <label className="apv-field">
                <span>
                  휴가 종류 <span className="apv-required">*</span>
                </span>
                <select
                  value={form.leaveType}
                  onChange={(e) => {
                    const v = e.target.value as LeaveType | ''
                    const half = LEAVE_TYPES.find((l) => l.value === v)?.halfDay
                    setForm((prev) => ({
                      ...prev,
                      leaveType: v,
                      leaveEndDate: half ? prev.leaveStartDate : prev.leaveEndDate,
                    }))
                    setDirty(true)
                  }}
                >
                  <option value="">선택</option>
                  {LEAVE_TYPES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="apv-field">
                <span>사용 일수</span>
                <div className="apv-readonly">{days != null ? `${days}일` : '-'}</div>
              </div>
              <label className="apv-field">
                <span>
                  시작일 <span className="apv-required">*</span>
                </span>
                <input
                  type="date"
                  value={form.leaveStartDate}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((prev) => ({
                      ...prev,
                      leaveStartDate: v,
                      leaveEndDate:
                        selectedLeave?.halfDay || !prev.leaveEndDate || prev.leaveEndDate < v ? v : prev.leaveEndDate,
                    }))
                    setDirty(true)
                  }}
                />
              </label>
              <label className="apv-field">
                <span>
                  종료일 <span className="apv-required">*</span>
                </span>
                <input
                  type="date"
                  value={form.leaveEndDate}
                  min={form.leaveStartDate || undefined}
                  disabled={!!selectedLeave?.halfDay}
                  onChange={(e) => update('leaveEndDate', e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </section>

      {/* 4. 내용 */}
      <section className="apv-card">
        <div className="apv-card-title-row">
          <h2 className="apv-card-title">
            {form.type === 'EXPENSE' ? '지출 사유' : form.type === 'LEAVE' ? '휴가 사유' : '기안 내용'}
            {form.type !== 'LEAVE' && <span className="apv-required"> *</span>}
          </h2>
          {form.type === 'GENERAL' && !form.content.trim() && (
            <button type="button" className="apv-link-btn" onClick={() => update('content', GENERAL_TEMPLATE)}>
              기본 양식 넣기
            </button>
          )}
        </div>
        <textarea
          className="apv-textarea"
          value={form.content}
          onChange={(e) => update('content', e.target.value)}
          placeholder={CONTENT_PLACEHOLDER[form.type]}
          maxLength={MAX_CONTENT}
          rows={12}
        />
        <div className="apv-counter">
          {form.content.length.toLocaleString()} / {MAX_CONTENT.toLocaleString()}자
        </div>
      </section>

      {/* 5. 첨부파일 */}
      <section className="apv-card">
        <h2 className="apv-card-title">첨부파일</h2>
        <AttachmentInput
          existing={existing}
          removedIds={removedIds}
          newFiles={newFiles}
          onRemoveExisting={(aid) => {
            setRemovedIds((prev) => [...prev, aid])
            setDirty(true)
          }}
          onRestoreExisting={(aid) => setRemovedIds((prev) => prev.filter((x) => x !== aid))}
          onNewFilesChange={(files) => {
            setNewFiles(files)
            setDirty(true)
          }}
        />
      </section>

      {/* 하단 버튼 */}
      <div className="apv-action-bar">
        <button type="button" className="apv-btn apv-btn--ghost" onClick={cancel} disabled={!!saving}>
          취소
        </button>
        <div className="apv-action-bar-right">
          <button type="button" className="apv-btn apv-btn--secondary" onClick={() => save(false)} disabled={!!saving}>
            {saving === 'draft' ? '저장 중...' : '임시저장'}
          </button>
          <button type="button" className="apv-btn apv-btn--primary" onClick={() => save(true)} disabled={!!saving}>
            {saving === 'submit' ? '저장 중...' : '전자서명 후 상신'}
          </button>
        </div>
      </div>
    </div>
  )
}
