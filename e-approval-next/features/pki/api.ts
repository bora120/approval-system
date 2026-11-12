import { api } from '@/lib/api-client'
import type { CertificateInfo, Challenge, MyCertificate, PrivateKeyBackup } from './types'

export const pkiApi = {
  me: () => api<MyCertificate>('/api/pki/me'),

  challenge: () => api<Challenge>('/api/pki/challenge', { method: 'POST' }),

  issue: (publicKey: string, proof: string, loginPassword: string, backup: Omit<PrivateKeyBackup, 'serialNumber' | 'publicKey'>) =>
    api<CertificateInfo>('/api/pki/certificates', {
      method: 'POST',
      body: JSON.stringify({
        publicKey,
        proof,
        loginPassword,
        encryptedPrivateKey: backup.wrappedKey,
        privateKeySalt: backup.salt,
        privateKeyIv: backup.iv,
        privateKeyIterations: backup.iterations,
      }),
    }),

  /** 인증서가 이미 있는 구버전 사용자도 현재 브라우저 키 암호문을 백업할 수 있다. */
  savePrivateKeyBackup: (backup: PrivateKeyBackup) =>
    api<PrivateKeyBackup>('/api/pki/me/private-key-backup', {
      method: 'PUT',
      body: JSON.stringify(backup),
    }),

  /** 새 브라우저에서는 이 암호문을 내려받아 인증서 암호로만 복호화한다. */
  privateKeyBackup: () => api<PrivateKeyBackup>('/api/pki/me/private-key-backup'),

  /** 다른 사용자에게 공개할 인증서(공개키) */
  publicCertificate: (loginId: string) =>
    api<CertificateInfo>(`/api/pki/users/${encodeURIComponent(loginId)}/certificate`),

  certificateUrl: (serial: string) => `/api/pki/certificates/${encodeURIComponent(serial)}`,

  caCertificateUrl: () => '/api/pki/ca-certificate',
}
