package com.example.approval.controller;

import com.example.approval.domain.UserStatus;
import com.example.approval.dto.UserResponse;
import com.example.approval.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 관리자 전용 (SecurityConfig에서 /api/admin/** 는 ROLE_ADMIN만 허용) */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final AuthService authService;

    public AdminUserController(AuthService authService) {
        this.authService = authService;
    }

    /** 상태별 사용자 목록. 기본값: 승인 대기 */
    @GetMapping
    public List<UserResponse> list(@RequestParam(defaultValue = "PENDING") UserStatus status) {
        return authService.findByStatus(status);
    }

    @PatchMapping("/{id}/approve")
    public UserResponse approve(@PathVariable Long id) {
        return authService.approve(id);
    }

    @PatchMapping("/{id}/reject")
    public UserResponse reject(@PathVariable Long id) {
        return authService.reject(id);
    }
}
