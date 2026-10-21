package com.example.approval.document.controller;

import com.example.approval.document.dto.ApproverResponse;
import com.example.approval.document.service.ApprovalLineService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/approval-line")
public class ApprovalLineController {

    private final ApprovalLineService approvalLineService;

    public ApprovalLineController(ApprovalLineService approvalLineService) {
        this.approvalLineService = approvalLineService;
    }

    /** 내 직책·부서 기준 기본 결재선 */
    @GetMapping("/default")
    public List<ApproverResponse> defaultLine(Authentication auth) {
        return approvalLineService.defaultLine(auth.getName());
    }

    /** 결재자 검색 (?keyword=이름 또는 부서) */
    @GetMapping("/approvers")
    public List<ApproverResponse> approvers(Authentication auth,
                                            @RequestParam(required = false) String keyword) {
        return approvalLineService.search(auth.getName(), keyword);
    }
}
