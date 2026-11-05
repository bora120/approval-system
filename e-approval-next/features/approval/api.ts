import { api, ApiError, readErrorMessage } from '@/lib/api-client'
import type {
  Approver,
  DecisionPayload,
  DocumentDetail,
  DocumentPayload,
  DocumentStatus,
  DocumentSummary,
  SignatureVerification,
  SubmitPayload,
} from './types'

/** 파일 업로드용 요청 (Content-Type 은 브라우저가 boundary 와 함께 자동 설정) */
async function sendMultipart<T>(url: string, payload: DocumentPayload, files: File[]): Promise<T> {
  const form = new FormData()
  form.append('data', new Blob([JSON.stringify(payload)], { type: 'application/json' }))
  files.forEach((f) => form.append('files', f))

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: form, credentials: 'include' })
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다.')
  }
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res, '저장에 실패했습니다.'))
  }
  return (await res.json()) as T
}

export const documentApi = {
  myDocuments: (status?: DocumentStatus) =>
    api<DocumentSummary[]>(`/api/documents${status ? `?status=${status}` : ''}`),

  inbox: () => api<DocumentSummary[]>('/api/documents/inbox'),

  detail: (id: number) => api<DocumentDetail>(`/api/documents/${id}`),

  create: (payload: DocumentPayload, files: File[]) =>
    sendMultipart<DocumentDetail>('/api/documents', payload, files),

  update: (id: number, payload: DocumentPayload, files: File[]) =>
    sendMultipart<DocumentDetail>(`/api/documents/${id}`, payload, files),

  withdraw: (id: number) => api<DocumentDetail>(`/api/documents/${id}/withdraw`, { method: 'POST' }),

  /** 상신 — 임시저장 문서 + 기안자 전자서명 (서명 사슬의 첫 고리) */
  submit: (id: number, payload: SubmitPayload) =>
    api<DocumentDetail>(`/api/documents/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** 승인 — 전자서명(DecisionPayload) 필수. comment 는 서명한 값 그대로 보내야 한다 */
  approve: (id: number, payload: DecisionPayload) =>
    api<DocumentDetail>(`/api/documents/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** 반려 — 사유 필수 + 전자서명 필수 */
  reject: (id: number, payload: DecisionPayload) =>
    api<DocumentDetail>(`/api/documents/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** 결재 전자서명 검증 결과 */
  signatures: (id: number) => api<SignatureVerification>(`/api/documents/${id}/signatures`),

  /** 반려 문서를 새 임시저장 문서로 복사 */
  copy: (id: number) => api<DocumentDetail>(`/api/documents/${id}/copy`, { method: 'POST' }),

  /** 내가 승인/반려한 문서 */
  decided: () => api<DocumentSummary[]>('/api/documents/decided'),

  remove: (id: number) => api<void>(`/api/documents/${id}`, { method: 'DELETE' }),

  attachmentUrl: (docId: number, attachmentId: number) =>
    `/api/documents/${docId}/attachments/${attachmentId}`,
}

export const approvalLineApi = {
  defaultLine: () => api<Approver[]>('/api/approval-line/default'),
  search: (keyword: string) =>
    api<Approver[]>(`/api/approval-line/approvers?keyword=${encodeURIComponent(keyword)}`),
}
