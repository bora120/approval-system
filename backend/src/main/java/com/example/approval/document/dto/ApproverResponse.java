package com.example.approval.document.dto;

import com.example.approval.domain.User;

/** 결재자 선택 목록에 보여줄 사용자 정보 */
public record ApproverResponse(
        Long id,
        String name,
        String department,
        String position,
        String positionLabel
) {
    public static ApproverResponse from(User u) {
        return new ApproverResponse(
                u.getId(), u.getName(), u.getDepartment(),
                u.getPosition() == null ? null : u.getPosition().name(),
                u.getPosition() == null ? "관리자" : u.getPosition().getLabel());
    }
}
