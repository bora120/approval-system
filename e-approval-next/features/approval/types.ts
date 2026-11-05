// 결재 문서 관련 타입. 값은 백엔드 enum 이름과 맞춰야 함
import type { SigningContext } from '@/features/pki/certificate'

export type DocumentType = 'GENERAL' | 'EXPENSE' | 'LEAVE'
export type DocumentStatus = 'DRAFT' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'
export type LineStatus = 'WAITING' | 'CURRENT' | 'APPROVED' | 'REJECTED'
export type ExpenseCategory = 'MEAL' | 'TRANSPORT' | 'SUPPLIES' | 'EDUCATION' | 'ENTERTAINMENT' | 'OTHER'
export type LeaveType = 'ANNUAL' | 'HALF_AM' | 'HALF_PM' | 'SICK' | 'OTHER'

export const DOCUMENT_TYPES: { value: DocumentType; label: string; icon: string; description: string }[] = [
  { value: 'GENERAL', label: '기안서', icon: '📝', description: '업무 진행, 구매 요청 등 일반 결재' },
  { value: 'EXPENSE', label: '지출결의서', icon: '💳', description: '비용 사용 내역 승인 요청' },
  { value: 'LEAVE', label: '휴가신청서', icon: '🌴', description: '연차·반차·병가 신청' },
]

export const STATUS_TABS: { value: DocumentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'DRAFT', label: '임시저장' },
  { value: 'IN_PROGRESS', label: '진행중' },
  { value: 'APPROVED', label: '승인완료' },
  { value: 'REJECTED', label: '반려' },
]

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'MEAL', label: '식대' },
  { value: 'TRANSPORT', label: '교통비' },
  { value: 'SUPPLIES', label: '소모품비' },
  { value: 'EDUCATION', label: '교육훈련비' },
  { value: 'ENTERTAINMENT', label: '접대비' },
  { value: 'OTHER', label: '기타' },
]

export const LEAVE_TYPES: { value: LeaveType; label: string; halfDay: boolean }[] = [
  { value: 'ANNUAL', label: '연차', halfDay: false },
  { value: 'HALF_AM', label: '오전반차', halfDay: true },
  { value: 'HALF_PM', label: '오후반차', halfDay: true },
  { value: 'SICK', label: '병가', halfDay: false },
  { value: 'OTHER', label: '기타', halfDay: false },
]

// 백엔드 FileStorageService / DocumentUploadConfig 와 같은 값
export const ALLOWED_EXTENSIONS = [
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'zip',
]
export const MAX_FILE_SIZE_MB = 10
export const MAX_FILE_COUNT = 5
export const MAX_APPROVERS = 5
export const MAX_TITLE = 100
export const MAX_CONTENT = 5000

export interface Approver {
  id: number
  name: string
  department: string | null
  position: string | null
  positionLabel: string
}

export interface ApprovalLine {
  stepOrder: number
  approver: Approver
  status: LineStatus
  statusLabel: string
  comment: string | null
  actedAt: string | null
  signed: boolean // 인증서 전자서명으로 처리됐는지
  certificateSerial: string | null
}

/** 상신 요청 (기안자 전자서명) */
export interface SubmitPayload {
  signature: string
  signedAt: string
  certificateSerial: string
}

/** 승인/반려 요청 (결재자 전자서명 + 의견) */
export interface DecisionPayload extends SubmitPayload {
  comment: string | null
}

/** 서명 사슬 검증 결과 (백엔드 DocumentIntegrity) */
export type DocumentIntegrity = 'DRAFT' | 'VALID' | 'INVALID' | 'LEGACY'

/** GET /api/documents/:id/signatures — 서명 사슬 검증 결과 */
export interface SignatureCheck {
  label: string
  ok: boolean
  detail: string
}

export interface SignatureResult {
  step: number // 0 = 기안, 1.. = 결재 순서
  role: string // 기안 / 결재
  signerName: string
  signerPositionLabel: string
  action: 'SUBMIT' | 'APPROVE' | 'REJECT'
  actionLabel: string
  signed: boolean
  valid: boolean
  summary: string
  checks: SignatureCheck[]
  certificate: {
    serialNumber: string
    subject: string
    issuer: string
    notBefore: string
    notAfter: string
    status: string
    statusLabel: string
    revokedAt: string | null
    algorithm: string
  } | null
  signedAt: string | null
  signedMessage: string | null
  signature: string | null
  signatureDigest: string | null
}

export interface SignatureVerification {
  integrity: DocumentIntegrity
  integrityLabel: string
  summary: string
  checkedAt: string
  documentHash: string
  canonicalContent: string
  caSubject: string | null
  documentChecks: SignatureCheck[]
  signatures: SignatureResult[]
}

export interface AttachmentInfo {
  id: number
  originalName: string
  size: number
  sha256: string
  uploadedAt: string
}

export interface DocumentSummary {
  id: number
  docNumber: string | null
  type: DocumentType
  typeLabel: string
  title: string
  status: DocumentStatus
  statusLabel: string
  writerName: string
  writerDepartment: string | null
  currentApproverName: string | null
  attachmentCount: number
  createdAt: string
  submittedAt: string | null
  integrity: DocumentIntegrity | null // null = 아직 검증 안 됨
  integrityLabel: string
}

export interface DocumentDetail {
  id: number
  docNumber: string | null
  type: DocumentType
  typeLabel: string
  title: string
  content: string | null
  status: DocumentStatus
  statusLabel: string
  writer: Approver

  amount: number | null
  expenseDate: string | null
  expenseCategory: ExpenseCategory | null
  expenseCategoryLabel: string | null

  leaveType: LeaveType | null
  leaveTypeLabel: string | null
  leaveStartDate: string | null
  leaveEndDate: string | null

  approvalLines: ApprovalLine[]
  attachments: AttachmentInfo[]

  createdAt: string
  updatedAt: string
  submittedAt: string | null
  completedAt: string | null

  permissions: {
    canEdit: boolean
    canDelete: boolean
    canWithdraw: boolean
    canSubmit: boolean // 기안자 전자서명 후 상신
    canDecide: boolean
    canCopy: boolean
  }

  // ----- 전자서명 -----
  writerSigned: boolean
  writerCertificateSerial: string | null
  integrity: DocumentIntegrity | null
  integrityLabel: string
  integrityDetail: string | null
  integrityCheckedAt: string | null
  /** 지금 내가 서명할 차례일 때만 옴 (상신 또는 결재) */
  signing: SigningContext | null
}

/** 작성 화면 → 서버로 보내는 문서 내용 */
export interface DocumentPayload {
  type: DocumentType
  title: string
  content: string | null
  amount: number | null
  expenseDate: string | null
  expenseCategory: ExpenseCategory | null
  leaveType: LeaveType | null
  leaveStartDate: string | null
  leaveEndDate: string | null
  approverIds: number[]
  removedAttachmentIds: number[]
  /** 항상 false. 상신은 저장 후 documentApi.submit(전자서명) 으로 따로 한다 */
  submit: false
}
