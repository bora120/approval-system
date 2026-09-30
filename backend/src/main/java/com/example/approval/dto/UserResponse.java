package com.example.approval.dto;

import com.example.approval.domain.User;
import java.time.LocalDateTime;

/** 클라이언트로 내보내는 사용자 정보 (비밀번호 제외) */
public record UserResponse(
        Long id,
        String loginId,
        String name,
        String department,
        String position,       // STAFF, TEAM_LEADER ...
        String positionLabel,  // 사원, 팀장 ...
        String role,
        String status,
        LocalDateTime createdAt
) {
    public static UserResponse from(User u) {
        return new UserResponse(
                u.getId(), u.getLoginId(), u.getName(), u.getDepartment(),
                u.getPosition() == null ? null : u.getPosition().name(),
                u.getPosition() == null ? "관리자" : u.getPosition().getLabel(),
                u.getRole().name(), u.getStatus().name(), u.getCreatedAt());
    }
}
