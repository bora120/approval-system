package com.example.approval.organization.controller;

import com.example.approval.dto.UserResponse;
import com.example.approval.organization.dto.PositionChangeRequest;
import com.example.approval.organization.dto.RoleChangeRequest;
import com.example.approval.organization.service.OrganizationService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 조직 관리 (관리자·대표)
 *  GET   /api/admin/users/all             전체 직원
 *  PATCH /api/admin/users/{id}/position   직책 변경 (부대표 지정은 대표만)
 *  PATCH /api/admin/users/{id}/role       관리자 권한 부여/회수 (대표만, SecurityConfig 에서도 제한)
 * 가입 승인/거절은 AdminUserController (/api/admin/users/{id}/approve|reject)
 */
@RestController
@RequestMapping("/api/admin/users")
public class OrganizationController {

    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @GetMapping("/all")
    public List<UserResponse> all() {
        return organizationService.allUsers();
    }

    @PatchMapping("/{id}/position")
    public UserResponse changePosition(Authentication auth, @PathVariable Long id, @RequestBody PositionChangeRequest body) {
        return organizationService.changePosition(auth.getName(), id, body == null ? null : body.position());
    }

    @PatchMapping("/{id}/role")
    public UserResponse changeRole(Authentication auth, @PathVariable Long id, @RequestBody RoleChangeRequest body) {
        return organizationService.changeRole(auth.getName(), id, body == null ? null : body.role());
    }
}
