package com.example.approval.document.dto;

import com.example.approval.document.domain.ApprovalDocument;
import com.example.approval.document.domain.DocumentIntegrity;
import com.example.approval.document.domain.DocumentStatus;
import com.example.approval.document.service.DocumentSignatureService;
import com.example.approval.domain.User;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 문서 상세 (작성 화면의 수정 모드에서도 사용) */
public record DocumentDetailResponse(
        Long id,
        String docNumber,
        String type,
        String typeLabel,
        String title,
        String content,
        String status,
        String statusLabel,
        ApproverResponse writer,

        Long amount,
        LocalDate expenseDate,
        String expenseCategory,
        String expenseCategoryLabel,

        String leaveType,
        String leaveTypeLabel,
        LocalDate leaveStartDate,
        LocalDate leaveEndDate,

        List<ApprovalLineResponse> approvalLines,
        List<AttachmentResponse> attachments,

        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime submittedAt,
        LocalDateTime completedAt,

        Permissions permissions,

        // ----- 전자서명 -----
        boolean writerSigned,            // 기안자가 상신할 때 전자서명했는지
        String writerCertificateSerial,
        String integrity,                // 서명 사슬 검증 결과 (DocumentIntegrity), 미검증이면 null
        String integrityLabel,
        String integrityDetail,          // 실패 사유
        LocalDateTime integrityCheckedAt,
        SigningContext signing           // 지금 내가 서명할 차례일 때만 (상신 또는 결재)
) {
    /** 현재 로그인한 사용자가 이 문서에 할 수 있는 동작 (버튼 표시용) */
    public record Permissions(boolean canEdit, boolean canDelete, boolean canWithdraw,
                              boolean canSubmit, boolean canDecide, boolean canCopy) {}

    public static DocumentDetailResponse of(ApprovalDocument d, User viewer) {
        boolean isWriter = d.isWrittenBy(viewer);
        SigningContext signing = DocumentSignatureService.signingContextFor(d, viewer);
        Permissions permissions = new Permissions(
                isWriter && d.isDraft(),
                isWriter && d.isDraft(),
                isWriter && d.canWithdraw(),
                isWriter && d.isDraft(),                              // 기안자 서명 후 상신
                d.isTurnOf(viewer) && signing != null,                // 지금 내 차례 + 앞 서명 사슬이 있음
                isWriter && d.getStatus() == DocumentStatus.REJECTED); // 반려된 문서 → 다시 작성
        DocumentIntegrity integrity = d.getIntegrity();

        return new DocumentDetailResponse(
                d.getId(),
                d.getDocNumber(),
                d.getType().name(),
                d.getType().getLabel(),
                d.getTitle(),
                d.getContent(),
                d.getStatus().name(),
                d.getStatus().getLabel(),
                ApproverResponse.from(d.getWriter()),

                d.getAmount(),
                d.getExpenseDate(),
                d.getExpenseCategory() == null ? null : d.getExpenseCategory().name(),
                d.getExpenseCategory() == null ? null : d.getExpenseCategory().getLabel(),

                d.getLeaveType() == null ? null : d.getLeaveType().name(),
                d.getLeaveType() == null ? null : d.getLeaveType().getLabel(),
                d.getLeaveStartDate(),
                d.getLeaveEndDate(),

                d.getLines().stream().map(ApprovalLineResponse::from).toList(),
                d.getAttachments().stream().map(AttachmentResponse::from).toList(),

                d.getCreatedAt(),
                d.getUpdatedAt(),
                d.getSubmittedAt(),
                d.getCompletedAt(),
                permissions,

                d.isWriterSigned(),
                d.getWriterCertificate() == null ? null : d.getWriterCertificate().getSerialNumber(),
                integrity == null ? null : integrity.name(),
                integrity == null ? "미검증" : integrity.getLabel(),
                d.getIntegrityDetail(),
                d.getIntegrityCheckedAt(),
                signing);
    }
}
