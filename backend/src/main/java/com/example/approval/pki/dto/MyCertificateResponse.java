package com.example.approval.pki.dto;

/**
 * 내 현재 인증서.
 *
 * @param certificate        발급받은 적이 없거나 만료·폐기됐으면 null
 * @param privateKeyBackedUp 서버에 암호화된 개인키가 보관돼 있는지 (다른 PC 에서 자동 복원 가능 여부)
 */
public record MyCertificateResponse(CertificateResponse certificate, boolean privateKeyBackedUp) {}
