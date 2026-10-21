package com.example.approval.document.dto;

import com.example.approval.document.domain.DocumentType;
import com.example.approval.document.domain.ExpenseCategory;
import com.example.approval.document.domain.LeaveType;

import java.time.LocalDate;
import java.util.List;

/**
 * 문서 저장/상신 요청 (multipart 의 "data" 파트에 JSON 으로 담겨 옴).
 * submit=false 면 임시저장, true 면 상신. 상신일 때만 필수 항목을 엄격하게 검사한다.
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
