package com.example.approval.messenger.domain;

import com.example.approval.domain.User;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 종단간 암호화된 1:1 메시지. 서버는 평문을 볼 수 없다.
 *
 * 저장 항목
 *  - ciphertext / iv            : AES-256-GCM 으로 암호화한 본문(JSON: 텍스트 + 첨부파일 정보)
 *  - encKeyForReceiver          : AES 키를 "받는 사람" 공개키로 암호화한 값
 *  - encKeyForSender            : AES 키를 "보낸 사람" 자신의 공개키로 암호화한 값 (보낸 메시지도 다시 읽기 위함)
 *  - signature                  : 보낸 사람의 RSA-PSS 전자서명
 *  - senderKey / receiverKey    : 어떤 버전의 키로 암호화·서명했는지
 *  - clientMessageId            : 브라우저가 만든 UUID. 서명에 포함되고 DB 에서 중복 불가 → 재전송(replay) 차단
 *  - file*                      : 첨부파일(암호화된 상태로 디스크 저장) 정보
 *      fileExpiresAt    : 보관 기한. 지나면 스케줄러가 암호문 파일을 지운다
 *      fileDownloadedAt : 받는 사람이 처음 내려받은 시각 (수신 확인)
 *      fileDeletedAt    : 전송 취소·삭제·만료로 파일이 지워진 시각 (메시지 기록은 남김)
 */
@Entity
@Table(name = "secure_messages", indexes = {
        @Index(name = "idx_secure_msg_sender_receiver", columnList = "sender_id, receiver_id"),
        @Index(name = "idx_secure_msg_receiver_read", columnList = "receiver_id, read_at"),
        @Index(name = "idx_secure_msg_file_expires", columnList = "file_expires_at")
})
public class SecureMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 36)
    private String clientMessageId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id")
    private User sender;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receiver_id")
    private User receiver;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_key_id")
    private MessengerKey senderKey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receiver_key_id")
    private MessengerKey receiverKey;

    @Column(nullable = false, length = 1024)
    private String encKeyForReceiver;

    @Column(nullable = false, length = 1024)
    private String encKeyForSender;

    @Column(nullable = false, length = 32)
    private String iv;

    // @Lob 을 쓰면 PostgreSQL 에서는 본문이 별도 Large Object(oid)로 저장돼 다루기 까다롭다.
    // 최대 길이가 정해져 있으므로(MessengerLimits.MAX_CIPHERTEXT_LENGTH = 50,000) 일반 문자열 컬럼으로 저장
    @Column(nullable = false, length = 50_000)
    private String ciphertext;

    @Column(nullable = false, length = 1024)
    private String signature;

    // ----- 첨부파일 (암호문) -----
    @Column(length = 64)
    private String fileStoredName;

    private Long fileCipherSize;

    @Column(length = 64)
    private String fileCipherSha256;

    @Column(name = "file_expires_at")
    private LocalDateTime fileExpiresAt;

    private LocalDateTime fileDownloadedAt;

    private LocalDateTime fileDeletedAt;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private FileDeleteReason fileDeleteReason;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    protected SecureMessage() {}

    public SecureMessage(String clientMessageId, User sender, User receiver,
                         MessengerKey senderKey, MessengerKey receiverKey,
                         String encKeyForReceiver, String encKeyForSender,
                         String iv, String ciphertext, String signature) {
        this.clientMessageId = clientMessageId;
        this.sender = sender;
        this.receiver = receiver;
        this.senderKey = senderKey;
        this.receiverKey = receiverKey;
        this.encKeyForReceiver = encKeyForReceiver;
        this.encKeyForSender = encKeyForSender;
        this.iv = iv;
        this.ciphertext = ciphertext;
        this.signature = signature;
        this.createdAt = LocalDateTime.now();
    }

    public void attachFile(String storedName, long cipherSize, String cipherSha256, LocalDateTime expiresAt) {
        this.fileStoredName = storedName;
        this.fileCipherSize = cipherSize;
        this.fileCipherSha256 = cipherSha256;
        this.fileExpiresAt = expiresAt;
    }

    public boolean hasFile() { return fileStoredName != null; }

    /** 지금 내려받을 수 있는 상태인지 (삭제·만료되지 않음) */
    public boolean isFileAvailable(LocalDateTime now) {
        return hasFile() && fileDeletedAt == null && (fileExpiresAt == null || fileExpiresAt.isAfter(now));
    }

    /** 받는 사람이 처음 내려받았을 때 수신 확인 기록 */
    public void markFileDownloaded(LocalDateTime now) {
        if (fileDownloadedAt == null) this.fileDownloadedAt = now;
    }

    public void markFileDeleted(FileDeleteReason reason, LocalDateTime now) {
        if (fileDeletedAt != null) return;
        this.fileDeletedAt = now;
        this.fileDeleteReason = reason;
    }

    public boolean isSentBy(User u) { return sender.getId().equals(u.getId()); }

    public boolean isParticipant(User u) {
        return sender.getId().equals(u.getId()) || receiver.getId().equals(u.getId());
    }

    public Long getId() { return id; }
    public String getClientMessageId() { return clientMessageId; }
    public User getSender() { return sender; }
    public User getReceiver() { return receiver; }
    public MessengerKey getSenderKey() { return senderKey; }
    public MessengerKey getReceiverKey() { return receiverKey; }
    public String getEncKeyForReceiver() { return encKeyForReceiver; }
    public String getEncKeyForSender() { return encKeyForSender; }
    public String getIv() { return iv; }
    public String getCiphertext() { return ciphertext; }
    public String getSignature() { return signature; }
    public String getFileStoredName() { return fileStoredName; }
    public Long getFileCipherSize() { return fileCipherSize; }
    public String getFileCipherSha256() { return fileCipherSha256; }
    public LocalDateTime getFileExpiresAt() { return fileExpiresAt; }
    public LocalDateTime getFileDownloadedAt() { return fileDownloadedAt; }
    public LocalDateTime getFileDeletedAt() { return fileDeletedAt; }
    public FileDeleteReason getFileDeleteReason() { return fileDeleteReason; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getReadAt() { return readAt; }
}
