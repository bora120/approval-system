package com.example.approval.pki.dto;

import com.example.approval.pki.crypto.PkiCrypto;
import com.example.approval.pki.domain.UserCertificate;

import java.security.cert.CertificateEncodingException;
import java.security.cert.X509Certificate;
import java.time.LocalDateTime;

/** 인증서 정보 (화면 표시용) */
public record CertificateResponse(
        String serialNumber,
        String subject,
        String issuer,
        LocalDateTime notBefore,
        LocalDateTime notAfter,
        String status,
        String statusLabel,
        LocalDateTime revokedAt,
        String algorithm,
        String fingerprintSha256,
        String pem
) {
    public static final String ALGORITHM = "ECDSA P-256 / SHA-256";

    public static CertificateResponse from(UserCertificate c) {
        X509Certificate x = PkiCrypto.fromPem(c.getCertificatePem());
        String fingerprint;
        try {
            fingerprint = PkiCrypto.sha256Hex(x.getEncoded()).toUpperCase();
        } catch (CertificateEncodingException e) {
            fingerprint = "";
        }
        return new CertificateResponse(
                c.getSerialNumber(),
                c.getSubjectDn(),
                x.getIssuerX500Principal().getName(),
                c.getNotBefore(),
                c.getNotAfter(),
                c.getStatus().name(),
                c.getStatus().getLabel(),
                c.getRevokedAt(),
                ALGORITHM,
                fingerprint,
                c.getCertificatePem());
    }
}
