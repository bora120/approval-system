package com.example.approval.organization.controller;

import com.example.approval.organization.dto.OrganizationMemberResponse;
import com.example.approval.organization.service.OrganizationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** 로그인 사용자를 위한 조직도 조회 API */
@RestController
@RequestMapping("/api/organization")
public class OrganizationTreeController {
    private final OrganizationService organizationService;

    public OrganizationTreeController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @GetMapping("/tree")
    public List<OrganizationMemberResponse> tree() {
        return organizationService.organizationTree();
    }
}
