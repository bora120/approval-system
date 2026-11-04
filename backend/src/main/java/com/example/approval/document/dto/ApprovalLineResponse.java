package com.example.approval.document.dto;

import com.example.approval.document.domain.ApprovalLine;

import java.time.LocalDateTime;

public record ApprovalLineResponse(
        int stepOrder,
        ApproverResponse approver,
        String status,
        String statusLabel,
        String comment,
        LocalDateTime actedAt,
        boolean signed,            // 인증서 전자서명으로 처리됐는지
        String certificateSerial   // 서명에 쓴 인증서 일련번호
) {
    public static ApprovalLineResponse from(ApprovalLine l) {
        return new ApprovalLineResponse(
                l.getStepOrder(),
                ApproverResponse.from(l.getApprover()),
                l.getStatus().name(),
                l.getStatus().getLabel(),
                l.getComment(),
                l.getActedAt(),
                l.isSigned(),
                l.getCertificate() == null ? null : l.getCertificate().getSerialNumber());
    }
}
