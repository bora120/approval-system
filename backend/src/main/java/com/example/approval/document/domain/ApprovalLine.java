package com.example.approval.document.domain;

import com.example.approval.domain.User;
import com.example.approval.pki.domain.UserCertificate;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/** 결재선의 한 칸: "몇 번째로, 누가 결재하는지" */
@Entity
@Table(name = "approval_lines")
public class ApprovalLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id")
    private ApprovalDocument document;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approver_id")
    private User approver;

    @Column(nullable = false)
    private int stepOrder; // 1부터 시작

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LineStatus status;

    @Column(length = 500)
    private String comment; // 승인/반려 의견 (결재 처리 기능에서 사용)

    private LocalDateTime actedAt;

    // ----- 전자서명 (승인·반려할 때 결재자의 인증서로 서명) -----
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "certificate_id")
    private UserCertificate certificate;

    @Column(length = 1000)
    private String signedMessage;  // 서명 원문

    @Column(length = 100)
    private String signatureValue; // ECDSA 서명값 (Base64)

    protected ApprovalLine() {}

    ApprovalLine(ApprovalDocument document, User approver, int stepOrder) {
        this.document = document;
        this.approver = approver;
        this.stepOrder = stepOrder;
        this.status = LineStatus.WAITING;
    }

    void markCurrent() { this.status = LineStatus.CURRENT; }

    void approve(String comment, LocalDateTime now, LineSignature signature) {
        this.status = LineStatus.APPROVED;
        this.comment = comment;
        this.actedAt = now;
        applySignature(signature);
    }

    void reject(String comment, LocalDateTime now, LineSignature signature) {
        this.status = LineStatus.REJECTED;
        this.comment = comment;
        this.actedAt = now;
        applySignature(signature);
    }

    private void applySignature(LineSignature s) {
        if (s == null) throw new IllegalArgumentException("전자서명이 필요합니다.");
        this.certificate = s.certificate();
        this.signedMessage = s.message();
        this.signatureValue = s.signature();
    }

    public boolean isApprover(User user) { return approver.getId().equals(user.getId()); }

    public boolean isSigned() { return signatureValue != null; }

    void reset() {
        this.status = LineStatus.WAITING;
        this.comment = null;
        this.actedAt = null;
        this.certificate = null;
        this.signedMessage = null;
        this.signatureValue = null;
    }

    public Long getId() { return id; }
    public ApprovalDocument getDocument() { return document; }
    public User getApprover() { return approver; }
    public int getStepOrder() { return stepOrder; }
    public LineStatus getStatus() { return status; }
    public String getComment() { return comment; }
    public LocalDateTime getActedAt() { return actedAt; }
    public UserCertificate getCertificate() { return certificate; }
    public String getSignedMessage() { return signedMessage; }
    public String getSignatureValue() { return signatureValue; }
}
