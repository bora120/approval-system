'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CertificateInfo } from '../types'
import { formatCertDate } from '../utils'

interface Props {
  title: string
  description: string
  cert: CertificateInfo
  confirmLabel: string
  /** 인증서 암호를 받아 서명 + 서버 전송까지 처리. 실패하면 throw → 창에 에러 표시 후 다시 입력 가능 */
  onSubmit: (certPassword: string) => Promise<void>
  onClose: () => void
}

/** 결재할 때 뜨는 "인증서 암호 입력" 창 */
export default function CertPasswordDialog({ title, description, cert, confirmLabel, onSubmit, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError('인증서 암호를 입력하세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : '서명에 실패했습니다.')
      setPassword('')
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pki-modal" role="dialog" aria-modal="true" aria-labelledby="pki-modal-title">
      <form className="pki-modal-box" onSubmit={submit}>
        <h3 id="pki-modal-title">{title}</h3>
        <p className="pki-muted">{description}</p>

        <dl className="pki-cert-mini">
          <dt>인증서</dt>
          <dd>{cert.subject}</dd>
          <dt>일련번호</dt>
          <dd className="pki-mono">{cert.serialNumber}</dd>
          <dt>유효기간</dt>
          <dd>~ {formatCertDate(cert.notAfter)}</dd>
        </dl>

        <label className="pki-field">
          인증서 암호
          <input
            ref={inputRef}
            type="password"
            autoComplete="off"
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="pki-error">{error}</div>}

        <div className="pki-modal-actions">
          <button type="button" className="apv-btn apv-btn--ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button type="submit" className="apv-btn apv-btn--primary" disabled={busy}>
            {busy ? '서명 중...' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
