package com.example.approval.document.domain;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/** 첨부파일 정보. 실제 파일은 디스크(app.upload.dir)에 랜덤 이름으로 저장 */
@Entity
@Table(name = "attachments")
public class Attachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id")
    private ApprovalDocument document;

    @Column(nullable = false, length = 255)
    private String originalName; // 사용자가 올린 파일명 (화면 표시용)

    @Column(nullable = false, unique = true, length = 64)
    private String storedName;   // 디스크에 저장된 이름 (UUID, 확장자 없음)

    @Column(length = 100)
    private String contentType;

    @Column(nullable = false)
    private long size;

    @Column(nullable = false, length = 64)
    private String sha256;       // 위변조 확인용 해시

    @Column(nullable = false)
    private LocalDateTime uploadedAt;

    protected Attachment() {}

    public Attachment(String originalName, String storedName, String contentType, long size, String sha256) {
        this.originalName = originalName;
        this.storedName = storedName;
        this.contentType = contentType;
        this.size = size;
        this.sha256 = sha256;
        this.uploadedAt = LocalDateTime.now();
    }

    void setDocument(ApprovalDocument document) { this.document = document; }

    public Long getId() { return id; }
    public ApprovalDocument getDocument() { return document; }
    public String getOriginalName() { return originalName; }
    public String getStoredName() { return storedName; }
    public String getContentType() { return contentType; }
    public long getSize() { return size; }
    public String getSha256() { return sha256; }
    public LocalDateTime getUploadedAt() { return uploadedAt; }
}
