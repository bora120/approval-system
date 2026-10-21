package com.example.approval.messenger.domain;

import com.example.approval.domain.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 사용자의 메신저 공개키 (한 세트 = 암호화용 RSA-OAEP + 서명용 RSA-PSS).
 *
 * - 개인키는 서버에 절대 저장하지 않는다. (브라우저 IndexedDB 에만 존재)
 * - 키를 새로 만들면 이전 키는 active=false 로 남겨 둔다.
 *   → 예전 메시지의 서명을 그때의 공개키로 계속 검증할 수 있다.
 */
@Entity
@Table(name = "messenger_keys")
public class MessengerKey {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, length = 2000)
    private String encPublicKey; // JWK(JSON) 문자열

    @Column(nullable = false, length = 2000)
    private String sigPublicKey; // JWK(JSON) 문자열

    @Column(nullable = false, length = 64)
    private String fingerprint;  // SHA-256(encPublicKey + "\n" + sigPublicKey), 안전번호 표시용

    @Column(nullable = false)
    private boolean active;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected MessengerKey() {}

    public MessengerKey(User user, String encPublicKey, String sigPublicKey, String fingerprint) {
        this.user = user;
        this.encPublicKey = encPublicKey;
        this.sigPublicKey = sigPublicKey;
        this.fingerprint = fingerprint;
        this.active = true;
        this.createdAt = LocalDateTime.now();
    }

    public void deactivate() { this.active = false; }

    public boolean isOwnedBy(User u) { return user.getId().equals(u.getId()); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public String getEncPublicKey() { return encPublicKey; }
    public String getSigPublicKey() { return sigPublicKey; }
    public String getFingerprint() { return fingerprint; }
    public boolean isActive() { return active; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
