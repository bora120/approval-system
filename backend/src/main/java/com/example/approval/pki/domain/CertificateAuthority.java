package com.example.approval.pki.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 사내 인증기관(CA) — 루트 인증서와 암호화된 CA 개인키.
 *
 * 팀원 모두가 같은 DB(Supabase)를 쓰므로 CA 도 DB 에 하나만 둔다.
 *  - 처음 켠 서버가 CA 를 만들어 저장하고, 나머지 서버는 그걸 불러와 쓴다.
 *  - 개인키는 평문으로 저장하지 않는다. .env 의 CA_KEY_PASSWORD 로 암호화(AES-256-GCM)되어 있어서
 *    DB 가 유출돼도 비밀번호 없이는 인증서를 위조할 수 없다.
 */
@Entity
@Table(name = "pki_ca")
public class CertificateAuthority {

    public static final String ROOT = "ROOT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 항상 "ROOT". 중복 불가 → 두 서버가 동시에 만들려 해도 하나만 저장됨 */
    @Column(nullable = false, unique = true, length = 20)
    private String name;

    @Column(nullable = false, length = 2000)
    private String certificatePem;

    @Column(nullable = false, length = 1000)
    private String encryptedPrivateKey; // Base64(AES-GCM(PKCS#8))

    @Column(nullable = false, length = 64)
    private String keySalt;

    @Column(nullable = false, length = 64)
    private String keyIv;

    @Column(nullable = false)
    private int kdfIterations;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected CertificateAuthority() {}

    public CertificateAuthority(String certificatePem, String encryptedPrivateKey, String keySalt,
                                String keyIv, int kdfIterations) {
        this.name = ROOT;
        this.certificatePem = certificatePem;
        this.encryptedPrivateKey = encryptedPrivateKey;
        this.keySalt = keySalt;
        this.keyIv = keyIv;
        this.kdfIterations = kdfIterations;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getCertificatePem() { return certificatePem; }
    public String getEncryptedPrivateKey() { return encryptedPrivateKey; }
    public String getKeySalt() { return keySalt; }
    public String getKeyIv() { return keyIv; }
    public int getKdfIterations() { return kdfIterations; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
