package com.example.approval.document.repository;

import com.example.approval.document.domain.ApprovalDocument;
import com.example.approval.document.domain.DocumentStatus;
import com.example.approval.document.domain.DocumentType;
import com.example.approval.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ApprovalDocumentRepository extends JpaRepository<ApprovalDocument, Long> {

    List<ApprovalDocument> findByWriterOrderByIdDesc(User writer);

    List<ApprovalDocument> findByWriterAndStatusOrderByIdDesc(User writer, DocumentStatus status);

    /** 문서번호 발급용: 예) EXP-2026- 로 시작하는 문서 수 */
    long countByTypeAndDocNumberStartingWith(DocumentType type, String prefix);
}
