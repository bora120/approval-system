package com.example.approval.document.repository;

import com.example.approval.document.domain.ApprovalLine;
import com.example.approval.document.domain.LineStatus;
import com.example.approval.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ApprovalLineRepository extends JpaRepository<ApprovalLine, Long> {

    /** 내가 결재할 차례인 결재선 (결재 대기함) */
    List<ApprovalLine> findByApproverAndStatusOrderByIdDesc(User approver, LineStatus status);

    /** 내가 이미 승인·반려한 결재선 (결재한 문서함) */
    List<ApprovalLine> findTop100ByApproverAndStatusInOrderByActedAtDesc(User approver, Collection<LineStatus> statuses);
}
