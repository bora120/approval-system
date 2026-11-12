package com.example.approval.pki.domain;

import com.example.approval.domain.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 사용자에게 발급한 X.509 인증서 + 암호화된 개인키 보관.
 *
 *  - 인증서(공개키)는 공개 문서다. 다른 사람이 내 서명을 검증할 때 쓴다.
 *  - 개인키는 브라우저에서 "인증서 암호"로 암호화(PBKDF2 60만 회 + AES-256-GCM)한 암호문만 저장한다.
 *    인증서 암호와 평문 개인키는 서버로 오지 않으므로 서버는 이 암호문을 풀 수 없다.
 *    → 다른 PC 에서도 인증서 암호만 알면 개인키를 복원해 결재할 수 있다.
 *  - 인증서를 다시 발급하면 이전 인증서는 REVOKED(폐기)로 바뀐다.
 *    폐기 전에 한 서명은 "서명 당시 유효"했으므로 계속 유효하게 검증된다.
 */
@Entity
@Table(name = "user_certificates")
public class UserCertificate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, unique = true, length = 40)
    private String serialNumber; // 대문자 16진수

    @Column(nullable = false, length = 300)
    private String subjectDn;

    @Column(nullable = false, length = 2000)
    private String certificatePem;

    @Column(nullable = false)
    private LocalDateTime notBefore;

    @Column(nullable = false)
    private LocalDateTime notAfter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CertificateStatus status;

    private LocalDateTime revokedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    // ----- 암호화된 개인키 (암호문만. 평문 개인키·인증서 암호는 저장하지 않음) -----
    @Column(name = "encrypted_private_key", length = 12000)
    private String encryptedPrivateKey;    // Base64(AES-GCM(PKCS#8))

    @Column(name = "private_key_public_key", length = 2000)
    private String privateKeyPublicKey;    // 짝이 되는 공개키 (SPKI Base64) — 인증서 공개키와 같아야 함

    @Column(name = "private_key_salt", length = 128)
    private String privateKeySalt;         // PBKDF2 salt

    @Column(name = "private_key_iv", length = 64)
    private String privateKeyIv;           // AES-GCM IV

    @Column(name = "private_key_iterations")
    private Integer privateKeyIterations;  // PBKDF2 반복 횟수

    protected UserCertificate() {}

    public UserCertificate(User user, String serialNumber, String subjectDn, String certificatePem,
                           LocalDateTime notBefore, LocalDateTime notAfter) {
        this.user = user;
        this.serialNumber = serialNumber;
        this.subjectDn = subjectDn;
        this.certificatePem = certificatePem;
        this.notBefore = notBefore;
        this.notAfter = notAfter;
        this.status = CertificateStatus.VALID;
        this.createdAt = LocalDateTime.now();
    }

    /** 브라우저가 암호화한 개인키 암호문 저장(갱신) */
    public void saveEncryptedPrivateKey(String publicKey, String encryptedPrivateKey,
                                        String salt, String iv, int iterations) {
        this.privateKeyPublicKey = publicKey;
        this.encryptedPrivateKey = encryptedPrivateKey;
        this.privateKeySalt = salt;
        this.privateKeyIv = iv;
        this.privateKeyIterations = iterations;
    }

    public boolean hasEncryptedPrivateKey() {
        return encryptedPrivateKey != null && !encryptedPrivateKey.isBlank();
    }

    public void revoke() {
        if (status == CertificateStatus.REVOKED) return;
        this.status = CertificateStatus.REVOKED;
        this.revokedAt = LocalDateTime.now();
    }

    public boolean isOwnedBy(User u) { return user.getId().equals(u.getId()); }

    /** 지금 서명에 쓸 수 있는지 (폐기 안 됨 + 유효기간 안) */
    public boolean isUsableNow() {
        LocalDateTime now = LocalDateTime.now();
        return status == CertificateStatus.VALID && !now.isBefore(notBefore) && now.isBefore(notAfter);
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public String getSerialNumber() { return serialNumber; }
    public String getSubjectDn() { return subjectDn; }
    public String getCertificatePem() { return certificatePem; }
    public LocalDateTime getNotBefore() { return notBefore; }
    public LocalDateTime getNotAfter() { return notAfter; }
    public CertificateStatus getStatus() { return status; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public String getEncryptedPrivateKey() { return encryptedPrivateKey; }
    public String getPrivateKeyPublicKey() { return privateKeyPublicKey; }
    public String getPrivateKeySalt() { return privateKeySalt; }
    public String getPrivateKeyIv() { return privateKeyIv; }
    public Integer getPrivateKeyIterations() { return privateKeyIterations; }
}
