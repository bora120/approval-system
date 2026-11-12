package com.example.approval.pki.dto;

import com.example.approval.pki.domain.UserCertificate;

/** 본인에게만 반환하는 암호화 개인키 백업. 인증서 비밀번호/평문 개인키는 포함하지 않는다. */
public record PrivateKeyBackupResponse(
        String serialNumber,
        String publicKey,
        String wrappedKey,
        String salt,
        String iv,
        Integer iterations
) {
    public static PrivateKeyBackupResponse from(UserCertificate certificate) {
        return new PrivateKeyBackupResponse(
                certificate.getSerialNumber(),
                certificate.getPrivateKeyPublicKey(),
                certificate.getEncryptedPrivateKey(),
                certificate.getPrivateKeySalt(),
                certificate.getPrivateKeyIv(),
                certificate.getPrivateKeyIterations()
        );
    }
}
