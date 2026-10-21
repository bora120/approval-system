package com.example.approval.document.dto;

import com.example.approval.document.domain.ApprovalLine;

import java.time.LocalDateTime;

public record ApprovalLineResponse(
        int stepOrder,
        ApproverResponse approver,
        String status,
        String statusLabel,
        String comment,
        LocalDateTime actedAt
) {
    public static ApprovalLineResponse from(ApprovalLine l) {
        return new ApprovalLineResponse(
                l.getStepOrder(),
                ApproverResponse.from(l.getApprover()),
                l.getStatus().name(),
                l.getStatus().getLabel(),
                l.getComment(),
                l.getActedAt());
    }
}
