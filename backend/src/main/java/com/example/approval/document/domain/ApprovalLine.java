package com.example.approval.document.domain;

import com.example.approval.domain.User;
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

    protected ApprovalLine() {}

    ApprovalLine(ApprovalDocument document, User approver, int stepOrder) {
        this.document = document;
        this.approver = approver;
        this.stepOrder = stepOrder;
        this.status = LineStatus.WAITING;
    }

    void markCurrent() { this.status = LineStatus.CURRENT; }

    void approve(String comment, LocalDateTime now) {
        this.status = LineStatus.APPROVED;
        this.comment = comment;
        this.actedAt = now;
    }

    void reject(String comment, LocalDateTime now) {
        this.status = LineStatus.REJECTED;
        this.comment = comment;
        this.actedAt = now;
    }

    public boolean isApprover(User user) { return approver.getId().equals(user.getId()); }

    void reset() {
        this.status = LineStatus.WAITING;
        this.comment = null;
        this.actedAt = null;
    }

    public Long getId() { return id; }
    public ApprovalDocument getDocument() { return document; }
    public User getApprover() { return approver; }
    public int getStepOrder() { return stepOrder; }
    public LineStatus getStatus() { return status; }
    public String getComment() { return comment; }
    public LocalDateTime getActedAt() { return actedAt; }
}
