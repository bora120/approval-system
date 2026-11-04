import { api } from '@/lib/api-client'
import type { CertificateInfo, Challenge, MyCertificate } from './types'

export const pkiApi = {
  me: () => api<MyCertificate>('/api/pki/me'),

  challenge: () => api<Challenge>('/api/pki/challenge', { method: 'POST' }),

  issue: (publicKey: string, proof: string, loginPassword: string) =>
    api<CertificateInfo>('/api/pki/certificates', {
      method: 'POST',
      body: JSON.stringify({ publicKey, proof, loginPassword }),
    }),

  certificateUrl: (serial: string) => `/api/pki/certificates/${encodeURIComponent(serial)}`,

  caCertificateUrl: () => '/api/pki/ca-certificate',
}
