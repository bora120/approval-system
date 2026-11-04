/**
 * 인증서 발급 · 서명 흐름 (화면에서는 이 함수들만 쓰면 된다)
 */
import { pkiApi } from './api'
import {
  buildCertRequestMessage,
  buildSignedMessage,
  generateProtectedKey,
  sha256Hex,
  signText,
  unlockKey,
} from './crypto'
import { getLocalKey, saveLocalKey } from './keystore'
import type { CertificateInfo, LocalKeyRecord } from './types'

/**
 * 인증서 발급
 *  1) 키쌍 생성 + 개인키를 인증서 암호로 암호화
 *  2) 서버에서 1회용 challenge 받기
 *  3) 발급 요청문(아이디 + challenge + 공개키)에 새 개인키로 서명 → 개인키 소유 증명
 *  4) 서버(CA)가 본인 확인 후 인증서 발급
 *  5) 암호화된 개인키를 이 브라우저에 저장
 */
export async function issueCertificate(
  loginId: string,
  loginPassword: string,
  certPassword: string,
): Promise<CertificateInfo> {
  const key = await generateProtectedKey(loginId, certPassword)
  const { challenge } = await pkiApi.challenge()
  const proof = await signText(key.signingKey, buildCertRequestMessage(loginId, challenge, key.publicKey))
  const cert = await pkiApi.issue(key.publicKey, proof, loginPassword)
  await saveLocalKey({
    loginId,
    serialNumber: cert.serialNumber,
    publicKey: key.publicKey,
    ...key.wrapped,
    createdAt: new Date().toISOString(),
  })
  return cert
}

/**
 * 이 브라우저에서 서명할 수 있는 상태인지
 *  - ready        : 서버 인증서 + 이 브라우저의 개인키가 짝이 맞음
 *  - no-cert      : 유효한 인증서가 없음 (발급 필요)
 *  - no-local-key : 인증서는 있지만 이 브라우저에 개인키가 없음 (다른 PC 에서 발급 등)
 *  - mismatch     : 이 브라우저의 키가 예전 인증서용 (다른 곳에서 재발급함)
 */
export type SignerState =
  | { kind: 'ready'; cert: CertificateInfo; record: LocalKeyRecord }
  | { kind: 'no-cert' }
  | { kind: 'no-local-key'; cert: CertificateInfo }
  | { kind: 'mismatch'; cert: CertificateInfo; record: LocalKeyRecord }

export async function loadSignerState(loginId: string): Promise<SignerState> {
  const [{ certificate }, record] = await Promise.all([pkiApi.me(), getLocalKey(loginId)])
  if (!certificate) return { kind: 'no-cert' }
  if (!record) return { kind: 'no-local-key', cert: certificate }
  if (record.serialNumber !== certificate.serialNumber) return { kind: 'mismatch', cert: certificate, record }
  return { kind: 'ready', cert: certificate, record }
}

export const SIGNER_STATE_MESSAGE: Record<Exclude<SignerState['kind'], 'ready'>, string> = {
  'no-cert': '결재하려면 먼저 전자서명 인증서를 발급받아야 합니다.',
  'no-local-key': '이 브라우저에는 인증서 개인키가 없습니다. 인증서를 발급받은 브라우저에서 결재하거나, 이 브라우저에서 재발급하세요.',
  mismatch: '이 브라우저의 개인키는 예전 인증서용입니다. 인증서 관리에서 재발급하세요.',
}

export interface DecisionSignature {
  signature: string
  signedAt: string
  certificateSerial: string
}

/** 결재(승인/반려) 서명 */
export async function signDecision(args: {
  record: LocalKeyRecord
  certPassword: string
  documentId: number
  documentNumber: string | null
  signingContent: string
  step: number
  approve: boolean
  comment: string | null
}): Promise<DecisionSignature> {
  const key = await unlockKey(args.record, args.certPassword) // 암호가 틀리면 여기서 에러
  const signedAt = new Date().toISOString()
  const message = await buildSignedMessage({
    documentId: args.documentId,
    documentNumber: args.documentNumber,
    documentHash: await sha256Hex(args.signingContent),
    step: args.step,
    approve: args.approve,
    comment: args.comment,
    signer: args.record.loginId,
    certificateSerial: args.record.serialNumber,
    signedAt,
  })
  return { signature: await signText(key, message), signedAt, certificateSerial: args.record.serialNumber }
}
