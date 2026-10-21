// 결재 문서 관련 타입. 값은 백엔드 enum 이름과 맞춰야 함

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
    canDecide: boolean
    canCopy: boolean
  }
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
  submit: boolean
}
