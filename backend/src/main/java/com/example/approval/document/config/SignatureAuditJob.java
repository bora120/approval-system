package com.example.approval.document.config;

import com.example.approval.document.service.DocumentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 전자서명 주기 감사.
 * 상신된 모든 문서의 서명 사슬(기안자 → 결재자)을 주기적으로 다시 검증해서 문서의 무결성 상태를 갱신한다.
 * → 아무도 문서를 열지 않아도, DB 를 직접 조작한 위·변조를 자동으로 찾아 "검증 실패"로 표시하고 로그를 남긴다.
 *
 * 주기: app.signature.audit-interval-ms (기본 30분), 서버 시작 2분 뒤 첫 실행.
 * (스케줄 기능은 MessengerFileCleanup 의 @EnableScheduling 으로 이미 켜져 있음)
 */
@Component
public class SignatureAuditJob {

    private static final Logger log = LoggerFactory.getLogger(SignatureAuditJob.class);
    private static final int MAX_BATCHES = 1000; // 5만 건에서 멈춤 (무한 반복 방지)

    private final DocumentService documentService;

    public SignatureAuditJob(DocumentService documentService) {
        this.documentService = documentService;
    }

    @Scheduled(initialDelayString = "${app.signature.audit-initial-delay-ms:120000}",
               fixedDelayString = "${app.signature.audit-interval-ms:1800000}")
    public void run() {
        long afterId = 0;
        int checked = 0;
        List<String> invalid = new ArrayList<>();
        try {
            for (int i = 0; i < MAX_BATCHES; i++) {
                DocumentService.AuditBatch batch = documentService.auditBatch(afterId); // 50건씩 각자 트랜잭션
                if (batch.checked() == 0) break;
                checked += batch.checked();
                invalid.addAll(batch.invalidDocuments());
                afterId = batch.lastId();
            }
        } catch (RuntimeException e) {
            log.warn("전자서명 주기 감사 중 오류 (다음 주기에 다시 시도)", e);
            return;
        }
        if (invalid.isEmpty()) {
            log.info("전자서명 주기 감사: 문서 {}건 모두 정상", checked);
        } else {
            log.warn("전자서명 주기 감사: 문서 {}건 중 {}건 검증 실패 (위·변조 의심)\n  {}",
                    checked, invalid.size(), String.join("\n  ", invalid));
        }
    }
}
