package com.example.approval.pki.dto;

/**
 * 인증서 발급 요청.
 *
 * @param publicKey            브라우저에서 만든 공개키 (SPKI DER, Base64)
 * @param proof                새 개인키로 발급 요청문에 서명한 값 → "이 공개키의 개인키를 정말 갖고 있다"는 증명
 * @param loginPassword        본인 확인용 로그인 비밀번호 (실제 인증기관의 본인확인 절차에 해당)
 * @param encryptedPrivateKey  인증서 암호로 브라우저에서 AES-256-GCM 암호화한 PKCS#8 개인키 (Base64)
 * @param privateKeySalt       PBKDF2 salt (Base64, 16바이트)
 * @param privateKeyIv         AES-GCM IV (Base64, 12바이트)
 * @param privateKeyIterations PBKDF2 반복 횟수
 *                             (인증서 암호 자체는 보내지 않으므로 서버는 암호문을 풀 수 없다)
 */
public record CertificateIssueRequest(
        String publicKey,
        String proof,
        String loginPassword,
        String encryptedPrivateKey,
        String privateKeySalt,
        String privateKeyIv,
        Integer privateKeyIterations
) {}
