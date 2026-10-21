package com.example.approval.document.dto;

import com.example.approval.document.domain.ApprovalDocument;

import java.time.LocalDateTime;

/** 문서 목록 한 줄 */
public record DocumentSummaryResponse(
        Long id,
        String docNumber,
        String type,
        String typeLabel,
        String title,
        String status,
        String statusLabel,
        String writerName,
        String writerDepartment,
        String currentApproverName,
        int attachmentCount,
        LocalDateTime createdAt,
        LocalDateTime submittedAt
) {
    public static DocumentSummaryResponse from(ApprovalDocument d) {
        return new DocumentSummaryResponse(
                d.getId(),
                d.getDocNumber(),
                d.getType().name(),
                d.getType().getLabel(),
                d.getTitle(),
                d.getStatus().name(),
                d.getStatus().getLabel(),
                d.getWriter().getName(),
                d.getWriter().getDepartment(),
                d.getCurrentLine().map(l -> l.getApprover().getName()).orElse(null),
                d.getAttachments().size(),
                d.getCreatedAt(),
                d.getSubmittedAt());
    }
}
