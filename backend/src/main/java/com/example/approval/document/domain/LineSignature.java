package com.example.approval.document.domain;

import com.example.approval.pki.domain.UserCertificate;

/**
 * 검증을 통과한 결재 전자서명 한 건.
 *
 * @param certificate 서명에 쓴 인증서
 * @param message     서명 원문 (문서 해시·결재 내용이 들어 있음, DocumentSignatureService.signedMessage)
 * @param signature   ECDSA 서명값 (r||s, Base64)
 */
public record LineSignature(UserCertificate certificate, String message, String signature) {}
