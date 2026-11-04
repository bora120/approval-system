'use client'

import { useCallback, useEffect, useState } from 'react'
import { documentApi } from '../api'
import type { SignatureVerification } from '../types'
import { formatDateTime } from '../utils'

interface Props {
  documentId: number
  /** 문서가 바뀌면(승인 직후 등) 다시 검증하도록 바뀌는 값 */
  refreshKey: string
}

/**
 * 결재 전자서명 검증 결과.
 * 서버가 "지금 DB 에 있는 문서"로 해시를 다시 계산해서 서명 당시 값과 비교한다.
 * → Supabase 에서 금액·내용을 몰래 바꾸면 "문서 위·변조 없음" 항목이 실패로 바뀐다.
 */
export default function SignaturePanel({ documentId, refreshKey }: Props) {
  const [data, setData] = useState<SignatureVerification | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const verify = useCallback(async () => {
    setLoading(true)
    try {
      setData(await documentApi.signatures(documentId))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '서명 검증에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    void verify()
  }, [verify, refreshKey])

  if (error) return <p className="apv-muted">{error}</p>
  if (!data) return <p className="apv-muted">전자서명 검증 중...</p>
  if (data.signatures.length === 0) return <p className="apv-muted">아직 결재(서명)한 사람이 없습니다.</p>

  return (
    <div className="pki-verify">
      <div className="pki-verify-head">
        <span className="apv-muted">
          검증 기준: {data.caSubject ?? '(인증기관을 불러오지 못함)'} · 현재 문서 해시{' '}
          <code className="pki-mono">{data.documentHash.slice(0, 16)}…</code>
        </span>
        <button className="apv-btn apv-btn--sm apv-btn--ghost apv-no-print" onClick={verify} disabled={loading}>
          {loading ? '검증 중...' : '다시 검증'}
        </button>
      </div>

      <ul className="pki-verify-list">
        {data.signatures.map((s) => (
          <li key={s.stepOrder} className="pki-verify-item">
            <div className="pki-verify-row">
              <strong>
                {s.stepOrder}. {s.signerName} {s.signerPositionLabel}
              </strong>
              <span>{s.decisionLabel}</span>
              <span className={`pki-badge ${s.valid ? 'pki-badge--ok' : 'pki-badge--fail'}`}>
                {s.valid ? '✔ 서명 유효' : s.signed ? '✖ 검증 실패' : '서명 없음'}
              </span>
              <span className="pki-muted">{formatDateTime(s.actedAt)}</span>
            </div>
            {!s.valid && <p className="pki-muted">{s.summary}</p>}

            {s.checks.length > 0 && (
              <ul className="pki-checks">
                {s.checks.map((c) => (
                  <li key={c.label} className={c.ok ? '' : 'pki-check--fail'}>
                    <span className="pki-check-mark">{c.ok ? '✔' : '✖'}</span>
                    <span>{c.label}</span>
                    <span className={c.ok ? 'pki-muted' : ''}>{c.detail}</span>
                  </li>
                ))}
              </ul>
            )}

            {s.certificate && (
              <details className="pki-details apv-no-print">
                <summary>인증서 · 서명 원문 보기</summary>
                <table className="pki-table">
                  <tbody>
                    <tr>
                      <th>주체</th>
                      <td>{s.certificate.subject}</td>
                    </tr>
                    <tr>
                      <th>발급자</th>
                      <td>{s.certificate.issuer}</td>
                    </tr>
                    <tr>
                      <th>일련번호</th>
                      <td className="pki-mono">{s.certificate.serialNumber}</td>
                    </tr>
                    <tr>
                      <th>유효기간</th>
                      <td>
                        {formatDateTime(s.certificate.notBefore)} ~ {formatDateTime(s.certificate.notAfter)}
                      </td>
                    </tr>
                    <tr>
                      <th>인증서 상태</th>
                      <td>
                        {s.certificate.statusLabel}
                        {s.certificate.revokedAt && ` (${formatDateTime(s.certificate.revokedAt)} 폐기)`}
                      </td>
                    </tr>
                    <tr>
                      <th>알고리즘</th>
                      <td>{s.certificate.algorithm}</td>
                    </tr>
                    <tr>
                      <th>서명값</th>
                      <td className="pki-mono pki-break">{s.signature}</td>
                    </tr>
                  </tbody>
                </table>
                <pre className="pki-pre">{s.signedMessage}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>

      <details className="pki-details apv-no-print">
        <summary>서명 대상 문서 내용(정규화) 보기</summary>
        <pre className="pki-pre">{data.canonicalContent}</pre>
      </details>
    </div>
  )
}
