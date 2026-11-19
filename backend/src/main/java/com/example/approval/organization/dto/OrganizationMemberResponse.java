package com.example.approval.organization.dto;

import com.example.approval.domain.User;

public record OrganizationMemberResponse(
        Long id,
        String name,
        String department,
        String position,
        String positionLabel
) {
    public static OrganizationMemberResponse from(User user) {
        return new OrganizationMemberResponse(
                user.getId(), user.getName(), user.getDepartment(),
                user.getPosition() == null ? null : user.getPosition().name(),
                user.getPosition() == null ? "관리자" : user.getPosition().getLabel()
        );
    }
}
