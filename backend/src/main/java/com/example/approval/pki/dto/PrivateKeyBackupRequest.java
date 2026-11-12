package com.example.approval.pki.dto;

/** 기존 인증서의 브라우저 개인키 암호문 백업/갱신 요청 */
public record PrivateKeyBackupRequest(
        String serialNumber,
        String publicKey,
        String wrappedKey,
        String salt,
        String iv,
        Integer iterations
) {}
