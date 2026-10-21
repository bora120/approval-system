import type { DocumentStatus } from '../types'

const LABELS: Record<DocumentStatus, string> = {
  DRAFT: '임시저장',
  IN_PROGRESS: '진행중',
  APPROVED: '승인완료',
  REJECTED: '반려',
}

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`apv-badge apv-badge--${status.toLowerCase()}`}>{LABELS[status]}</span>
}
