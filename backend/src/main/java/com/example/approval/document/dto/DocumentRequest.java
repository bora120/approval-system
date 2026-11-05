package com.example.approval.document.dto;

import com.example.approval.document.domain.DocumentType;
import com.example.approval.document.domain.ExpenseCategory;
import com.example.approval.document.domain.LeaveType;

import java.time.LocalDate;
import java.util.List;

/**
 * 문서 저장/상신 요청 (multipart 의 "data" 파트에 JSON 으로 담겨 옴).
 * 저장은 항상 임시저장이다. 상신은 기안자 전자서명이 필요하므로 POST /api/documents/{id}/submit 으로 따로 한다.
 * submit=true 는 예전 방식 호환용 필드로, 보내면 거부된다.
 */
public record DocumentRequest(
        DocumentType type,
        String title,
        String content,

        // 지출결의서
        Long amount,
        LocalDate expenseDate,
        ExpenseCategory expenseCategory,

        // 휴가신청서
        LeaveType leaveType,
        LocalDate leaveStartDate,
        LocalDate leaveEndDate,

        List<Long> approverIds,          // 결재 순서대로
        List<Long> removedAttachmentIds, // 수정 시 삭제할 기존 첨부파일
        boolean submit
) {
    public List<Long> approverIdsOrEmpty() {
        return approverIds == null ? List.of() : approverIds;
    }

    public List<Long> removedAttachmentIdsOrEmpty() {
        return removedAttachmentIds == null ? List.of() : removedAttachmentIds;
    }
}
