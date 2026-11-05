package com.example.approval.document.domain;

import com.example.approval.domain.User;
import com.example.approval.exception.ApiException;
import com.example.approval.pki.domain.UserCertificate;
import jakarta.persistence.*;
import org.springframework.http.HttpStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * 결재 문서.
 * 상태 흐름: DRAFT(임시저장) → IN_PROGRESS(진행중) → APPROVED / REJECTED
 *           IN_PROGRESS 에서 첫 결재자가 처리하기 전이면 회수하여 DRAFT 로 되돌릴 수 있음
 */
@Entity
@Table(name = "approval_documents")
public class ApprovalDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, length = 20)
    private String docNumber; // 상신할 때 발급 (예: EXP-2026-0001)

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DocumentType type;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(length = 5000)
    private String content;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "writer_id")
    private User writer;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DocumentStatus status;

    // ----- 지출결의서 전용 -----
    private Long amount;
    private LocalDate expenseDate;
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private ExpenseCategory expenseCategory;

    // ----- 휴가신청서 전용 -----
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private LeaveType leaveType;
    private LocalDate leaveStartDate;
    private LocalDate leaveEndDate;

    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepOrder ASC")
    private List<ApprovalLine> lines = new ArrayList<>();

    @OneToMany(mappedBy = "document", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<Attachment> attachments = new ArrayList<>();

    @Column(nullable = false)
    private LocalDateTime createdAt;
    @Column(nullable = false)
    private LocalDateTime updatedAt;
    private LocalDateTime submittedAt;
    private LocalDateTime completedAt;

    // ----- 기안자 전자서명 (상신할 때 기안자 인증서로 서명 = 서명 사슬의 첫 고리) -----
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "writer_certificate_id")
    private UserCertificate writerCertificate;

    @Column(length = 1000)
    private String writerSignedMessage;  // 서명 원문

    @Column(length = 100)
    private String writerSignatureValue; // ECDSA 서명값 (Base64)

    // ----- 무결성(서명 검증) 결과: 결재·열람·주기 감사 때 자동 갱신 -----
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private DocumentIntegrity integrity;

    @Column(length = 300)
    private String integrityDetail;      // 실패했다면 어떤 검증 항목이 실패했는지

    private LocalDateTime integrityCheckedAt;

    protected ApprovalDocument() {}

    public ApprovalDocument(User writer, DocumentType type) {
        this.writer = writer;
        this.type = type;
        this.title = "";
        this.status = DocumentStatus.DRAFT;
        this.integrity = DocumentIntegrity.DRAFT;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = this.createdAt;
    }

    // ===================== 내용 변경 =====================

    /** 제목/본문/양식별 항목 변경. 선택한 양식과 상관없는 항목은 비워서 저장 */
    public void changeContent(DocumentType type, String title, String content,
                              Long amount, LocalDate expenseDate, ExpenseCategory expenseCategory,
                              LeaveType leaveType, LocalDate leaveStartDate, LocalDate leaveEndDate) {
        requireDraft();
        this.type = type;
        this.title = title;
        this.content = content;

        boolean expense = type == DocumentType.EXPENSE;
        this.amount = expense ? amount : null;
        this.expenseDate = expense ? expenseDate : null;
        this.expenseCategory = expense ? expenseCategory : null;

        boolean leave = type == DocumentType.LEAVE;
        this.leaveType = leave ? leaveType : null;
        this.leaveStartDate = leave ? leaveStartDate : null;
        this.leaveEndDate = leave ? leaveEndDate : null;

        this.updatedAt = LocalDateTime.now();
    }

    /** 결재선을 통째로 교체 (approvers 순서 = 결재 순서) */
    public void replaceApprovers(List<User> approvers) {
        requireDraft();
        this.lines.clear();
        for (int i = 0; i < approvers.size(); i++) {
            this.lines.add(new ApprovalLine(this, approvers.get(i), i + 1));
        }
    }

    public void addAttachment(Attachment attachment) {
        requireDraft();
        attachment.setDocument(this);
        this.attachments.add(attachment);
    }

    public void removeAttachment(Attachment attachment) {
        requireDraft();
        this.attachments.remove(attachment);
    }

    // ===================== 상태 변경 =====================

    /**
     * 상신: 기안자 전자서명(검증 완료)을 붙이고 첫 번째 결재자에게 차례를 넘긴다.
     * 기안자 서명이 서명 사슬의 첫 고리가 된다.
     */
    public void submit(String docNumber, LineSignature writerSignature) {
        requireDraft();
        if (lines.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "결재자를 1명 이상 지정하세요.");
        }
        if (writerSignature == null) {
            throw new IllegalArgumentException("기안자 전자서명이 필요합니다.");
        }
        if (this.docNumber == null) {
            this.docNumber = docNumber; // 회수 후 재상신하면 기존 번호 유지
        }
        this.writerCertificate = writerSignature.certificate();
        this.writerSignedMessage = writerSignature.message();
        this.writerSignatureValue = writerSignature.signature();
        this.status = DocumentStatus.IN_PROGRESS;
        this.submittedAt = LocalDateTime.now();
        this.updatedAt = this.submittedAt;
        lines.forEach(ApprovalLine::reset);
        lines.get(0).markCurrent();
        recordIntegrity(DocumentIntegrity.VALID, null, this.submittedAt);
    }

    /** 서명 검증 결과 기록 (내용 수정이 아니므로 updatedAt 은 바꾸지 않음) */
    public void recordIntegrity(DocumentIntegrity result, String detail, LocalDateTime checkedAt) {
        this.integrity = result;
        this.integrityDetail = detail == null ? null
                : detail.length() > 300 ? detail.substring(0, 300) : detail;
        this.integrityCheckedAt = checkedAt;
    }

    public boolean isWriterSigned() { return writerSignatureValue != null; }

    /** 회수: 아직 아무도 결재하지 않았을 때만 임시저장 상태로 되돌림 */
    public void withdraw() {
        if (!canWithdraw()) {
            throw new ApiException(HttpStatus.CONFLICT, "이미 결재가 진행되어 회수할 수 없습니다.");
        }
        this.status = DocumentStatus.DRAFT;
        this.submittedAt = null;
        this.updatedAt = LocalDateTime.now();
        lines.forEach(ApprovalLine::reset);
        // 회수하면 내용을 다시 고칠 수 있으므로 기안자 서명도 무효 → 재상신 때 새로 서명
        this.writerCertificate = null;
        this.writerSignedMessage = null;
        this.writerSignatureValue = null;
        recordIntegrity(DocumentIntegrity.DRAFT, null, this.updatedAt);
    }

    /**
     * 승인: 지금 차례인 결재자만 가능. 다음 결재자에게 차례를 넘기고, 마지막이면 최종 승인.
     * signature 는 DocumentSignatureService 가 검증을 마친 전자서명.
     */
    public void approve(User approver, String comment, LineSignature signature) {
        ApprovalLine line = requireTurnOf(approver);
        LocalDateTime now = LocalDateTime.now();
        line.approve(comment, now, signature);
        Optional<ApprovalLine> next = lines.stream()
                .filter(l -> l.getStepOrder() == line.getStepOrder() + 1)
                .findFirst();
        if (next.isPresent()) {
            next.get().markCurrent();
        } else {
            this.status = DocumentStatus.APPROVED;
            this.completedAt = now;
        }
        this.updatedAt = now;
    }

    /** 반려: 지금 차례인 결재자만 가능. 문서는 즉시 반려 상태로 끝난다 */
    public void reject(User approver, String comment, LineSignature signature) {
        ApprovalLine line = requireTurnOf(approver);
        LocalDateTime now = LocalDateTime.now();
        line.reject(comment, now, signature);
        this.status = DocumentStatus.REJECTED;
        this.completedAt = now;
        this.updatedAt = now;
    }

    /** 이 사용자가 지금 결재할 차례인지 */
    public boolean isTurnOf(User user) {
        return status == DocumentStatus.IN_PROGRESS
                && getCurrentLine().map(l -> l.isApprover(user)).orElse(false);
    }

    /** 이 사용자가 지금 처리할 결재선 (차례가 아니면 예외). 서명 검증을 결재 전에 하기 위해 사용 */
    public ApprovalLine lineToDecide(User user) {
        return requireTurnOf(user);
    }

    private ApprovalLine requireTurnOf(User user) {
        if (status != DocumentStatus.IN_PROGRESS) {
            throw new ApiException(HttpStatus.CONFLICT, "진행 중인 문서만 결재할 수 있습니다.");
        }
        ApprovalLine line = getCurrentLine()
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "결재할 차례인 사람이 없습니다."));
        if (!line.isApprover(user)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "지금 결재할 차례가 아닙니다.");
        }
        return line;
    }

    public boolean canWithdraw() {
        return status == DocumentStatus.IN_PROGRESS
                && !lines.isEmpty()
                && lines.get(0).getStatus() == LineStatus.CURRENT;
    }

    public boolean isDraft() { return status == DocumentStatus.DRAFT; }

    public boolean isWrittenBy(User user) { return writer.getId().equals(user.getId()); }

    public boolean hasApprover(User user) {
        return lines.stream().anyMatch(l -> l.getApprover().getId().equals(user.getId()));
    }

    public Optional<ApprovalLine> getCurrentLine() {
        return lines.stream().filter(l -> l.getStatus() == LineStatus.CURRENT).findFirst();
    }

    private void requireDraft() {
        if (!isDraft()) {
            throw new ApiException(HttpStatus.CONFLICT, "임시저장 상태의 문서만 수정할 수 있습니다.");
        }
    }

    // ===================== getter =====================

    public Long getId() { return id; }
    public String getDocNumber() { return docNumber; }
    public DocumentType getType() { return type; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public User getWriter() { return writer; }
    public DocumentStatus getStatus() { return status; }
    public Long getAmount() { return amount; }
    public LocalDate getExpenseDate() { return expenseDate; }
    public ExpenseCategory getExpenseCategory() { return expenseCategory; }
    public LeaveType getLeaveType() { return leaveType; }
    public LocalDate getLeaveStartDate() { return leaveStartDate; }
    public LocalDate getLeaveEndDate() { return leaveEndDate; }
    public List<ApprovalLine> getLines() { return Collections.unmodifiableList(lines); }
    public List<Attachment> getAttachments() { return Collections.unmodifiableList(attachments); }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public LocalDateTime getCompletedAt() { return completedAt; }
    public UserCertificate getWriterCertificate() { return writerCertificate; }
    public String getWriterSignedMessage() { return writerSignedMessage; }
    public String getWriterSignatureValue() { return writerSignatureValue; }
    public DocumentIntegrity getIntegrity() { return integrity; }
    public String getIntegrityDetail() { return integrityDetail; }
    public LocalDateTime getIntegrityCheckedAt() { return integrityCheckedAt; }
}
