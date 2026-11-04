// 인증서(PKI) 관련 타입. 백엔드 com.example.approval.pki.dto 와 맞춘다

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
}

export interface Challenge {
  challenge: string
  loginId: string
}

/** 브라우저(IndexedDB)에 저장하는 내 개인키 (인증서 암호로 암호화된 상태) */
export interface LocalKeyRecord {
  loginId: string
  serialNumber: string
  publicKey: string // SPKI Base64 (서버에 등록된 공개키와 같은지 확인용)
  wrappedKey: string // AES-GCM(PKCS#8 개인키) Base64
  salt: string
  iv: string
  iterations: number
  createdAt: string
}
