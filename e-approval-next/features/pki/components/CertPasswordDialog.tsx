'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CertificateInfo } from '../types'
import { formatCertDate } from '../utils'
import { formatUntil } from '../useSigningSession'

/** 서명할 때 넘기는 인증 정보. certPassword 가 없으면 인증된(잠금 해제된) 키로 서명 */
export interface SignAuth {
  certPassword?: string
  keepUnlocked?: boolean
}

interface Props {
  title: string
  description: string
  cert: CertificateInfo
  confirmLabel: string
  /** 인증서 인증 상태면 만료 시각(ms), 아니면 null → 암호 입력 */
  sessionUntil: number | null
  /** 서명 + 서버 전송까지 처리. 실패하면 throw → 창에 에러 표시 후 다시 시도 */
  onSubmit: (auth: SignAuth) => Promise<void>
  onClose: () => void
}

/**
 * 결재할 때 뜨는 전자서명 창.
 *  - 인증 전 : 인증서 암호 입력. "로그아웃 전까지 인증 유지"를 켜면 다음부터는 암호를 묻지 않는다.
 *  - 인증 후 : 암호 없이 "무엇에 서명하는지" 확인만 받는다. (한 번 클릭으로 결재되는 것을 막음)
 */
export default function CertPasswordDialog({
  title,
  description,
  cert,
  confirmLabel,
  sessionUntil,
  onSubmit,
  onClose,
}: Props) {
  const [needPassword, setNeedPassword] = useState(sessionUntil === null)
  const [password, setPassword] = useState('')
  const [keepUnlocked, setKeepUnlocked] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (needPassword) inputRef.current?.focus()
    else confirmRef.current?.focus()
  }, [needPassword])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (needPassword && !password) {
      setError('인증서 암호를 입력하세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(needPassword ? { certPassword: password, keepUnlocked } : {})
    } catch (err) {
      setError(err instanceof Error ? err.message : '서명에 실패했습니다.')
      setPassword('')
      if (!needPassword) setNeedPassword(true) // 인증이 그사이 만료됐으면 암호 입력으로
      else inputRef.current?.focus()
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

        {needPassword ? (
          <>
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
            <label className="pki-check">
              <input
                type="checkbox"
                checked={keepUnlocked}
                disabled={busy}
                onChange={(e) => setKeepUnlocked(e.target.checked)}
              />
              로그아웃 전까지 인증 유지 (30분 동안 사용하지 않으면 자동 잠금)
            </label>
          </>
        ) : (
          <div className="pki-session-note">
            🔓 인증서 인증됨 · {formatUntil(sessionUntil!)}까지 암호 없이 서명합니다.
            <br />
            위 내용으로 전자서명하려면 아래 버튼을 누르세요.
          </div>
        )}
        {error && <div className="pki-error">{error}</div>}

        <div className="pki-modal-actions">
          <button type="button" className="apv-btn apv-btn--ghost" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button ref={confirmRef} type="submit" className="apv-btn apv-btn--primary" disabled={busy}>
            {busy ? '서명 중...' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
