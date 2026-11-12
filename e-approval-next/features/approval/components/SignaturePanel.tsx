'use client'

import { Fragment, useState } from 'react'
import { pkiApi } from '@/features/pki/api'
import type { ApprovalLine, SignatureCheck, SignatureResult, SignatureVerification } from '../types'
import { formatDateTime } from '../utils'
import IntegrityBadge from './IntegrityBadge'

interface Props {
  data: SignatureVerification | null
  error: string
  loading: boolean
  lines: ApprovalLine[]
  onReverify: () => void
}

/**
 * 전자서명 내역 — 한 장의 표로 보여준다. (인쇄에도 그대로 나옴)
 *   단계 | 서명자 | 처리 | 의견 | 서명 일시 | 인증서 일련번호 | 검증
 * 서명 원문·서명값·인증서 상세는 행의 "상세"를 누르면 그 자리에서 펼쳐진다. (다른 화면으로 이동하지 않음)
 *
 * 서버가 "지금 DB 에 있는 문서"로 해시를 다시 계산하고, 서명마다 앞 서명과 연결돼 있는지까지 확인한 결과다.
 * → DB 에서 금액·내용·결재 기록을 몰래 바꾸면 해당 행이 ✖ 로 바뀐다.
 */
export default function SignaturePanel({ data, error, loading, lines, onReverify }: Props) {
  const [open, setOpen] = useState<number | null>(null)

  if (error) return <p className="apv-muted">{error}</p>
  if (!data) return <p className="apv-muted">전자서명 검증 중...</p>

  const commentOf = (step: number) => lines.find((l) => l.stepOrder === step)?.comment ?? ''
  const failedDocChecks = data.documentChecks.filter((c) => !c.ok)

  return (
    <div className="pki-verify">
      <div className="pki-verify-head">
        <span>
          <IntegrityBadge integrity={data.integrity} label={data.integrityLabel} /> {data.summary}
        </span>
        <button className="apv-btn apv-btn--sm apv-btn--ghost apv-no-print" onClick={onReverify} disabled={loading}>
          {loading ? '검증 중...' : '다시 검증'}
        </button>
      </div>

      {failedDocChecks.length > 0 && <CheckList checks={failedDocChecks} />}

      <table className="pki-sig-table">
        <thead>
          <tr>
            <th>단계</th>
            <th>서명자</th>
            <th>처리</th>
            <th>의견</th>
            <th>서명 일시</th>
            <th>인증서 일련번호</th>
            <th>검증</th>
            <th className="apv-no-print" aria-label="상세" />
          </tr>
        </thead>
        <tbody>
          {data.signatures.map((s) => (
            <Fragment key={s.step}>
              <tr className={s.signed && !s.valid ? 'is-fail' : ''}>
                <td>{s.step === 0 ? '기안' : `${s.step}차`}</td>
                <td>
                  {s.signerName} <span className="pki-muted">{s.signerPositionLabel}</span>
                </td>
                <td>{s.actionLabel}</td>
                <td className="pki-sig-comment">{commentOf(s.step) || '-'}</td>
                <td>{formatDateTime(s.signedAt)}</td>
                <td className="pki-mono pki-break">{s.certificate?.serialNumber ?? '-'}</td>
                <td className="pki-sig-result">{s.valid ? '✔ 유효' : s.signed ? '✖ 실패' : '서명 없음'}</td>
                <td className="apv-no-print">
                  {s.signed && (
                    <button
                      type="button"
                      className="apv-btn apv-btn--sm apv-btn--ghost"
                      aria-expanded={open === s.step}
                      onClick={() => setOpen(open === s.step ? null : s.step)}
                    >
                      {open === s.step ? '닫기' : '상세'}
                    </button>
                  )}
                </td>
              </tr>
              {open === s.step && (
                <tr className="pki-sig-detail apv-no-print">
                  <td colSpan={8}>
                    <SignatureDetail s={s} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <p className="pki-muted pki-sig-foot">
        검증 기준: {data.caSubject ?? '(인증기관을 불러오지 못함)'} · 검증 시각 {formatDateTime(data.checkedAt)}
      </p>

      <details className="pki-details apv-no-print">
        <summary>서명 대상 문서 내용(정규화) 보기</summary>
        <pre className="pki-pre">{data.canonicalContent}</pre>
      </details>
    </div>
  )
}

function CheckList({ checks }: { checks: SignatureCheck[] }) {
  return (
    <ul className="pki-checks">
      {checks.map((c) => (
        <li key={c.label} className={c.ok ? '' : 'pki-check--fail'}>
          <span className="pki-check-mark">{c.ok ? '✔' : '✖'}</span>
          <span>{c.label}</span>
          <span className={c.ok ? 'pki-muted' : ''}>{c.detail}</span>
        </li>
      ))}
    </ul>
  )
}

/** 행을 펼쳤을 때: 검증 항목 + 인증서(공개) + 서명 원문 */
function SignatureDetail({ s }: { s: SignatureResult }) {
  return (
    <div className="pki-sig-detail-box">
      {!s.valid && <p>{s.summary}</p>}
      {s.checks.length > 0 && <CheckList checks={s.checks} />}
      {s.certificate && (
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
            <tr>
              <th>이 서명의 해시</th>
              <td className="pki-mono pki-break">{s.signatureDigest}</td>
            </tr>
          </tbody>
        </table>
      )}
      {s.signedMessage && <pre className="pki-pre">{s.signedMessage}</pre>}
      {s.certificate && (
        <div className="pki-actions">
          <a className="apv-btn apv-btn--sm" href={pkiApi.certificateUrl(s.certificate.serialNumber)} download>
            서명자 인증서 내려받기 (.crt)
          </a>
          <a className="apv-btn apv-btn--sm apv-btn--ghost" href={pkiApi.caCertificateUrl()} download>
            루트 CA 인증서
          </a>
        </div>
      )}
    </div>
  )
}
