package com.example.approval.pki.domain;

import com.example.approval.domain.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 사용자에게 발급한 X.509 인증서 (공개키 + CA 서명).
 *
 *  - 개인키는 서버에 없다. 사용자의 브라우저에만 "인증서 암호"로 암호화되어 저장된다.
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
}
