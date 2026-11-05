package com.example.approval.document.dto;

import com.example.approval.document.domain.ApprovalDocument;
import com.example.approval.document.domain.DocumentIntegrity;

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
        LocalDateTime submittedAt,
        String integrity,        // 전자서명 검증 결과 (DocumentIntegrity), 미검증이면 null
        String integrityLabel
) {
    public static DocumentSummaryResponse from(ApprovalDocument d) {
        DocumentIntegrity integrity = d.getIntegrity();
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
                d.getSubmittedAt(),
                integrity == null ? null : integrity.name(),
                integrity == null ? "미검증" : integrity.getLabel());
    }
}
