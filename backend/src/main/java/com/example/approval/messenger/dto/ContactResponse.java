package com.example.approval.messenger.dto;

import com.example.approval.domain.User;

/** 대화 상대 정보 */
public record ContactResponse(
        Long id,
        String name,
        String department,
        String positionLabel,
        boolean hasKey,
        String fingerprint
) {
    public static ContactResponse of(User u, String fingerprint) {
        return new ContactResponse(
                u.getId(),
                u.getName(),
                u.getDepartment(),
                u.getPosition() == null ? "관리자" : u.getPosition().getLabel(),
                fingerprint != null,
                fingerprint);
    }
}
