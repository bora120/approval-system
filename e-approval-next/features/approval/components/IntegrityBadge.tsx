import type { DocumentIntegrity } from '../types'

const MARK: Record<DocumentIntegrity, string> = {
  DRAFT: '',
  VALID: '✔ ',
  INVALID: '✖ ',
  LEGACY: '',
}

/** 전자서명(서명 사슬) 검증 결과 배지. 서버가 결재·열람·주기 감사 때 자동으로 갱신한 값 */
export default function IntegrityBadge({ integrity, label }: { integrity: DocumentIntegrity | null; label: string }) {
  const kind = integrity ?? 'UNCHECKED'
  return (
    <span className={`pki-badge pki-integrity pki-integrity--${kind.toLowerCase()}`} title="전자서명 검증 결과">
      {integrity ? MARK[integrity] : ''}
      {label}
    </span>
  )
}
