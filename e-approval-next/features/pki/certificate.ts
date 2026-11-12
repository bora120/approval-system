/**
 * 인증서 발급 · 개인키 백업/복원 · 인증서 인증(한 번 인증) · 문서 서명 흐름
 * 화면에서는 이 파일의 함수들만 쓰면 된다.
 */
import { pkiApi } from './api'
import {
  buildCertRequestMessage,
  buildSignedMessage,
  generateProtectedKey,
  sha256Hex,
  signText,
  unlockKey,
  type SignAction,
} from './crypto'
import {
  deleteSigningSession,
  getLocalKey,
  getSigningSession,
  saveLocalKey,
  saveSigningSession,
  type SigningSessionRecord,
} from './keystore'
import type { CertificateInfo, LocalKeyRecord, PrivateKeyBackup } from './types'

// ================================================================== 인증서 발급

/**
 * 인증서 발급
 *  1) 키쌍 생성 + 개인키를 인증서 암호로 암호화
 *  2) 서버에서 1회용 challenge 받기
 *  3) 발급 요청문(아이디 + challenge + 공개키)에 새 개인키로 서명 → 개인키 소유 증명
 *  4) 서버(CA)가 본인 확인 후 인증서 발급 + 암호화된 개인키를 DB 에 보관
 *  5) 같은 암호문을 이 브라우저에도 저장
 */
export async function issueCertificate(
  loginId: string,
  loginPassword: string,
  certPassword: string,
): Promise<CertificateInfo> {
  const key = await generateProtectedKey(loginId, certPassword)
  const { challenge } = await pkiApi.challenge()
  const proof = await signText(key.signingKey, buildCertRequestMessage(loginId, challenge, key.publicKey))
  const cert = await pkiApi.issue(key.publicKey, proof, loginPassword, key.wrapped)
  await saveLocalKey({
    loginId,
    serialNumber: cert.serialNumber,
    publicKey: key.publicKey,
    ...key.wrapped,
    createdAt: new Date().toISOString(),
  })
  await lockSigningSession(loginId) // 예전 인증서로 인증해 둔 상태는 버린다
  return cert
}

// ================================================================== 개인키 백업 / 복원

/** 이 브라우저의 개인키 암호문을 서버에 올린다 (서버 백업이 없던 예전 인증서용) */
export async function backupLocalPrivateKey(loginId: string): Promise<void> {
  const record = await getLocalKey(loginId)
  if (!record) throw new Error('이 브라우저에 백업할 개인키가 없습니다.')
  await pkiApi.savePrivateKeyBackup({
    serialNumber: record.serialNumber,
    publicKey: record.publicKey,
    wrappedKey: record.wrappedKey,
    salt: record.salt,
    iv: record.iv,
    iterations: record.iterations,
  })
}

/** 서버에 보관된 암호문을 이 브라우저로 내려받는다. 푸는 건 서명할 때 인증서 암호로 한다 */
export async function restorePrivateKeyBackup(loginId: string): Promise<LocalKeyRecord> {
  const backup: PrivateKeyBackup = await pkiApi.privateKeyBackup()
  const record: LocalKeyRecord = { loginId, ...backup, createdAt: new Date().toISOString() }
  await saveLocalKey(record)
  return record
}

// ================================================================== 서명 가능 상태

/**
 * 이 브라우저에서 서명할 수 있는 상태인지
 *  - ready        : 서버 인증서 + 이 브라우저의 개인키가 짝이 맞음
 *  - no-cert      : 유효한 인증서가 없음 (발급 필요)
 *  - no-local-key : 인증서는 있지만 이 브라우저에 개인키가 없고, 서버 백업도 없음
 *  - mismatch     : 이 브라우저의 키가 예전 인증서용이고, 서버 백업도 없음
 *
 * 서버 백업이 있으면 no-local-key / mismatch 는 자동으로 복원해서 ready 가 된다.
 * 반대로 ready 인데 서버 백업이 없으면 자동으로 백업한다.
 */
export type SignerState =
  | { kind: 'ready'; cert: CertificateInfo; record: LocalKeyRecord; backedUp: boolean; restored: boolean }
  | { kind: 'no-cert' }
  | { kind: 'no-local-key'; cert: CertificateInfo }
  | { kind: 'mismatch'; cert: CertificateInfo; record: LocalKeyRecord }

export async function loadSignerState(loginId: string): Promise<SignerState> {
  const [{ certificate, privateKeyBackedUp }, local] = await Promise.all([pkiApi.me(), getLocalKey(loginId)])
  if (!certificate) return { kind: 'no-cert' }

  let record = local
  let restored = false
  if (!record || record.serialNumber !== certificate.serialNumber) {
    if (privateKeyBackedUp) {
      try {
        const fromServer = await restorePrivateKeyBackup(loginId)
        if (fromServer.serialNumber === certificate.serialNumber) {
          record = fromServer
          restored = true
        }
      } catch {
        // 복원 실패 → 아래에서 안내 문구
      }
    }
    if (!restored) {
      return record ? { kind: 'mismatch', cert: certificate, record } : { kind: 'no-local-key', cert: certificate }
    }
  }

  let backedUp = privateKeyBackedUp
  if (!backedUp) {
    try {
      await backupLocalPrivateKey(loginId)
      backedUp = true
    } catch {
      // 백업 실패해도 이 브라우저에서 서명은 가능
    }
  }
  return { kind: 'ready', cert: certificate, record: record!, backedUp, restored }
}

export const SIGNER_STATE_MESSAGE: Record<Exclude<SignerState['kind'], 'ready'>, string> = {
  'no-cert': '결재하려면 먼저 전자서명 인증서를 발급받아야 합니다.',
  'no-local-key': '이 브라우저에 개인키가 없고 서버 백업도 없습니다. 인증서를 발급받은 브라우저에서 백업하거나, 재발급하세요.',
  mismatch: '이 브라우저의 개인키는 예전 인증서용이고 서버 백업도 없습니다. 인증서 관리에서 재발급하세요.',
}

// ================================================================== 인증서 인증 (한 번 인증하면 계속 사용)

/**
 * 인증서 암호로 한 번 인증하면, 로그아웃할 때까지 암호 없이 서명할 수 있다.
 *  - 30분 동안 서명하지 않으면 자동 잠금 (서명할 때마다 30분 연장)
 *  - 인증하고 8시간이 지나면 무조건 잠금
 *  - 로그아웃 · "잠금" 버튼 · 인증서 재발급 시 즉시 잠금
 * 보관하는 것은 "추출 불가" 서명 키라서, 이 브라우저 안에서 서명에만 쓸 수 있고 키 값은 꺼낼 수 없다.
 * 암호 입력은 생략해도, 서명 직전 확인 창은 항상 띄운다 (실수로 한 번에 결재되지 않게).
 */
export const SESSION_IDLE_MS = 30 * 60 * 1000
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000
export const SESSION_CHANGE_EVENT = 'pki-session-change'

export interface SigningSessionInfo {
  serialNumber: string
  idleExpiresAt: number
  absoluteExpiresAt: number
}

/** 같은 탭에서는 IndexedDB 를 매번 읽지 않도록 메모리에도 둔다 */
const memory = new Map<string, SigningSessionRecord>()

function notify(loginId: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: { loginId } }))
  }
}

function isAlive(s: SigningSessionRecord, serialNumber?: string): boolean {
  const now = Date.now()
  return s.idleExpiresAt > now && s.absoluteExpiresAt > now && (!serialNumber || s.serialNumber === serialNumber)
}

async function loadSession(loginId: string, serialNumber?: string): Promise<SigningSessionRecord | null> {
  let s = memory.get(loginId) ?? null
  if (!s) {
    try {
      s = await getSigningSession(loginId)
    } catch {
      s = null
    }
    if (s) memory.set(loginId, s)
  }
  if (!s) return null
  if (!isAlive(s, serialNumber)) {
    await lockSigningSession(loginId)
    return null
  }
  return s
}

/** 인증서 암호로 인증 (암호가 틀리면 에러) */
export async function startSigningSession(record: LocalKeyRecord, certPassword: string): Promise<SigningSessionInfo> {
  const key = await unlockKey(record, certPassword)
  return saveSession(record, key)
}

async function saveSession(record: LocalKeyRecord, key: CryptoKey): Promise<SigningSessionInfo> {
  const now = Date.now()
  const s: SigningSessionRecord = {
    loginId: record.loginId,
    serialNumber: record.serialNumber,
    key,
    idleExpiresAt: now + SESSION_IDLE_MS,
    absoluteExpiresAt: now + SESSION_MAX_MS,
  }
  memory.set(record.loginId, s)
  try {
    await saveSigningSession(s) // 새로고침해도 유지
  } catch {
    // IndexedDB 에 못 넣으면 이 탭에서만 유지
  }
  notify(record.loginId)
  return toInfo(s)
}

function toInfo(s: SigningSessionRecord): SigningSessionInfo {
  return { serialNumber: s.serialNumber, idleExpiresAt: s.idleExpiresAt, absoluteExpiresAt: s.absoluteExpiresAt }
}

/** 지금 인증된 상태인지 (화면 표시용). 인증서 일련번호까지 맞아야 유효 */
export async function signingSessionInfo(loginId: string, serialNumber?: string): Promise<SigningSessionInfo | null> {
  const s = await loadSession(loginId, serialNumber)
  return s ? toInfo(s) : null
}

/** 잠금 (로그아웃, 잠금 버튼, 재발급) */
export async function lockSigningSession(loginId?: string): Promise<void> {
  if (loginId) memory.delete(loginId)
  else memory.clear()
  try {
    await deleteSigningSession(loginId)
  } catch {
    // 무시
  }
  notify(loginId ?? '')
}

async function touchSession(s: SigningSessionRecord) {
  s.idleExpiresAt = Math.min(Date.now() + SESSION_IDLE_MS, s.absoluteExpiresAt)
  try {
    await saveSigningSession(s)
  } catch {
    // 무시
  }
  notify(s.loginId)
}

// ================================================================== 문서 서명

/** 서버가 내려주는 "지금 서명할 내용" (DocumentDetail.signing) */
export interface SigningContext {
  step: number
  documentNumber: string
  documentContent: string
  previousSignatureSha256: string
}

export interface DocumentSignature {
  signature: string
  signedAt: string
  certificateSerial: string
}

/**
 * 문서 서명 (상신·승인·반려 공통).
 * 문서 내용 해시 + 결재 내용 + 바로 앞 서명 해시를 묶은 원문에 서명한다.
 *
 * certPassword 가 있으면 그 암호로 개인키를 풀고(keepUnlocked 면 인증 상태로 남김),
 * 없으면 인증된 서명 키를 쓴다. 인증이 만료됐으면 에러.
 */
export async function signDocumentAction(args: {
  record: LocalKeyRecord
  certPassword?: string
  keepUnlocked?: boolean
  documentId: number
  signing: SigningContext
  action: SignAction
  comment: string | null
}): Promise<DocumentSignature> {
  let key: CryptoKey
  if (args.certPassword) {
    key = await unlockKey(args.record, args.certPassword) // 암호가 틀리면 여기서 에러
    if (args.keepUnlocked) await saveSession(args.record, key)
  } else {
    const s = await loadSession(args.record.loginId, args.record.serialNumber)
    if (!s) throw new Error('인증서 인증이 만료되었습니다. 인증서 암호를 다시 입력하세요.')
    key = s.key
    await touchSession(s)
  }

  const signedAt = new Date().toISOString()
  const message = await buildSignedMessage({
    documentId: args.documentId,
    documentNumber: args.signing.documentNumber,
    documentHash: await sha256Hex(args.signing.documentContent),
    step: args.signing.step,
    action: args.action,
    comment: args.comment,
    previousSignatureSha256: args.signing.previousSignatureSha256,
    signer: args.record.loginId,
    certificateSerial: args.record.serialNumber,
    signedAt,
  })
  return { signature: await signText(key, message), signedAt, certificateSerial: args.record.serialNumber }
}

// 로그아웃하면 인증 상태를 지운다 (lib/auth.ts 가 approval-logout 이벤트를 보냄)
if (typeof window !== 'undefined') {
  window.addEventListener('approval-logout', () => {
    void lockSigningSession()
  })
}
