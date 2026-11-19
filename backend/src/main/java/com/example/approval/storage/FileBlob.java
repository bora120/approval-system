package com.example.approval.storage;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 업로드한 파일의 실제 내용 (Supabase PostgreSQL 의 bytea 컬럼).
 *
 * 배포 서버(Render)의 디스크는 재배포·재시작 때마다 초기화되기 때문에, 파일을 디스크가 아니라 DB 에 보관한다.
 *  - 결재 첨부파일: 원본 그대로 (SHA-256 은 attachments 테이블에 기록되어 전자서명에 포함됨)
 *  - 메신저 파일: 브라우저에서 AES-256-GCM 으로 암호화된 암호문 (서버는 내용을 모름)
 * 어떤 파일인지(이름·작성자·권한)는 attachments / secure_messages 테이블이 관리하고, 여기는 내용만 둔다.
 */
@Entity
@Table(name = "file_blobs")
public class FileBlob {

    @Id
    @Column(name = "stored_name", length = 64)
    private String storedName; // attachments.stored_name / secure_messages.file_stored_name 과 같은 값

    @Column(nullable = false, length = 20)
    private String kind; // ATTACHMENT / MESSENGER

    @Column(nullable = false)
    private long size;

    @Column(nullable = false, length = 64)
    private String sha256;

    /** 파일 내용. PostgreSQL 에서는 bytea 로 만들어진다 (최대 1GB, 우리 한도는 파일당 20MB) */
    @Column(nullable = false, columnDefinition = "bytea")
    private byte[] data;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected FileBlob() {}

    public FileBlob(String storedName, String kind, byte[] data, String sha256) {
        this.storedName = storedName;
        this.kind = kind;
        this.data = data;
        this.size = data.length;
        this.sha256 = sha256;
        this.createdAt = LocalDateTime.now();
    }

    public String getStoredName() { return storedName; }
    public String getKind() { return kind; }
    public long getSize() { return size; }
    public String getSha256() { return sha256; }
    public byte[] getData() { return data; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
