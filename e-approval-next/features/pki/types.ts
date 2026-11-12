// 인증서(PKI) 관련 타입. 백엔드 com.example.approval.pki.dto 와 맞춘다.

export interface CertificateInfo {
  serialNumber: string
  subject: string
  issuer: string
  notBefore: string
  notAfter: string
  status: 'VALID' | 'REVOKED'
  statusLabel: string
  revokedAt: string | null
  algorithm: string
  fingerprintSha256: string
  pem: string
}

export interface MyCertificate {
  certificate: CertificateInfo | null
  /** 서버에 암호화된 개인키가 보관돼 있는지 (다른 PC 에서 자동 복원 가능) */
  privateKeyBackedUp: boolean
}

export interface Challenge {
  challenge: string
  loginId: string
}

/** 브라우저(IndexedDB)에 저장하는 개인키. PKCS#8 평문이 아닌 AES-GCM 암호문이다. */
export interface LocalKeyRecord {
  loginId: string
  serialNumber: string
  publicKey: string // SPKI Base64
  wrappedKey: string // AES-GCM(PKCS#8 개인키) Base64
  salt: string
  iv: string
  iterations: number
  createdAt: string
}

/** 백엔드와 주고받는 암호화 개인키 백업 데이터 */
export interface PrivateKeyBackup {
  serialNumber: string
  publicKey: string
  wrappedKey: string
  salt: string
  iv: string
  iterations: number
}
