/**
 * 결재 전자서명 암호 모듈 — 브라우저 Web Crypto API 사용
 *
 * 키      : ECDSA P-256 (서버 PkiCrypto 와 같은 곡선)
 * 서명    : ECDSA / SHA-256, 결과는 r||s 64바이트 (서버는 SHA256withECDSAinP1363Format 으로 검증)
 * 키 보관 : 개인키(PKCS#8)를 "인증서 암호"에서 PBKDF2 로 만든 AES-256-GCM 키로 암호화해 IndexedDB 에 저장
 *           서명할 때만 잠깐 풀어서 "추출 불가" 키로 가져온 뒤 서명한다.
 *
 * 서명 원문 형식은 서버(DocumentSignatureService.signedMessage)와 글자 하나까지 같아야 한다.
 */
import type { LocalKeyRecord } from './types'

const te = new TextEncoder()

const ECDSA_KEY = { name: 'ECDSA', namedCurve: 'P-256' } as const
const ECDSA_SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const
const PBKDF2_ITERATIONS = 600_000 // OWASP 2023 권장값 (PBKDF2-HMAC-SHA256)

export const MIN_CERT_PASSWORD = 8

/** 브라우저가 암호 기능을 쓸 수 있는지 (https 또는 localhost 에서만 가능) */
export function isCryptoAvailable(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && !!window.crypto?.subtle
}

// ------------------------------------------------------------------ 변환 도구

export function bytesToB64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', te.encode(text))
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------------ 인증서 암호로 개인키 감싸기

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function wrapAad(loginId: string): Uint8Array<ArrayBuffer> {
  return te.encode(`E-APPROVAL-USER-KEY v1|${loginId}`)
}

export interface NewKey {
  publicKey: string // SPKI Base64 → 서버로 보냄
  signingKey: CryptoKey // 발급 요청(PoP) 서명용, 추출 불가
  wrapped: Pick<LocalKeyRecord, 'wrappedKey' | 'salt' | 'iv' | 'iterations'>
}

/** 새 키쌍을 만들고, 개인키를 인증서 암호로 암호화한다 */
export async function generateProtectedKey(loginId: string, certPassword: string): Promise<NewKey> {
  // PKCS#8 로 한 번 꺼내서 암호화해야 하므로 생성할 때만 extractable=true
  const pair = await crypto.subtle.generateKey(ECDSA_KEY, true, ['sign', 'verify'])
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aes = await passwordKey(certPassword, salt, PBKDF2_ITERATIONS)
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: wrapAad(loginId) }, aes, pkcs8)

  // 서명용으로는 추출 불가 키를 새로 가져오고, 메모리의 평문 개인키는 0으로 덮어쓴다
  const signingKey = await crypto.subtle.importKey('pkcs8', pkcs8, ECDSA_KEY, false, ['sign'])
  pkcs8.fill(0)

  return {
    publicKey: bytesToB64(spki),
    signingKey,
    wrapped: {
      wrappedKey: bytesToB64(wrapped),
      salt: bytesToB64(salt),
      iv: bytesToB64(iv),
      iterations: PBKDF2_ITERATIONS,
    },
  }
}

/** 인증서 암호로 개인키를 풀어 서명용 키(추출 불가)로 가져온다. 암호가 틀리면 에러 */
export async function unlockKey(record: LocalKeyRecord, certPassword: string): Promise<CryptoKey> {
  const aes = await passwordKey(certPassword, b64ToBytes(record.salt), record.iterations)
  let pkcs8: Uint8Array
  try {
    pkcs8 = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(record.iv), additionalData: wrapAad(record.loginId) },
        aes,
        b64ToBytes(record.wrappedKey),
      ),
    )
  } catch {
    throw new Error('인증서 암호가 올바르지 않습니다.')
  }
  try {
    return await crypto.subtle.importKey('pkcs8', pkcs8 as Uint8Array<ArrayBuffer>, ECDSA_KEY, false, ['sign'])
  } finally {
    pkcs8.fill(0)
  }
}

export async function signText(key: CryptoKey, text: string): Promise<string> {
  const sig = await crypto.subtle.sign(ECDSA_SIGN, key, te.encode(text))
  return bytesToB64(sig)
}

// ------------------------------------------------------------------ 서명 원문 (서버와 동일해야 함)

/** 인증서 발급 요청문 — 서버 CertificateService.requestMessage */
export function buildCertRequestMessage(loginId: string, challenge: string, publicKey: string): string {
  return ['E-APPROVAL-CERT-REQUEST v1', `login-id: ${loginId}`, `challenge: ${challenge}`, `public-key: ${publicKey}`].join(
    '\n',
  )
}

/** 서명 종류: 상신(기안자) / 승인 / 반려 */
export type SignAction = 'SUBMIT' | 'APPROVE' | 'REJECT'

export interface SignedMessageInput {
  documentId: number
  documentNumber: string | null // 기안자(step 0)는 빈 값
  documentHash: string
  step: number // 0 = 기안, 1.. = 결재 순서
  action: SignAction
  comment: string | null
  previousSignatureSha256: string // 바로 앞 서명의 해시 (기안자는 "none") → 서명 사슬
  signer: string
  certificateSerial: string
  signedAt: string
}

/** 결재 서명 원문 v2 — 서버 DocumentSignatureService.signedMessage 와 글자 하나까지 같아야 한다 */
export async function buildSignedMessage(m: SignedMessageInput): Promise<string> {
  return [
    'E-APPROVAL-SIGNATURE v2',
    `document-id: ${m.documentId}`,
    `document-number: ${m.documentNumber ?? ''}`,
    `document-sha256: ${m.documentHash}`,
    `step: ${m.step}`,
    `action: ${m.action}`,
    `comment-sha256: ${await sha256Hex(m.comment ?? '')}`,
    `previous-signature-sha256: ${m.previousSignatureSha256}`,
    `signer: ${m.signer}`,
    `certificate-serial: ${m.certificateSerial}`,
    `signed-at: ${m.signedAt}`,
  ].join('\n')
}
