package com.example.approval.document.domain;

/**
 * 문서 무결성(전자서명 검증) 상태.
 * 결재할 때, 문서를 열 때, 그리고 주기적 감사(SignatureAuditJob) 때 자동으로 다시 계산되어 저장된다.
 */
public enum DocumentIntegrity {
    DRAFT("미상신"),          // 아직 서명 전 (임시저장)
    VALID("서명 유효"),        // 기안자~마지막 결재자 서명 사슬이 모두 검증됨
    INVALID("검증 실패"),      // 서명값·문서 내용·결재 기록 중 하나라도 맞지 않음 → 위·변조 의심
    LEGACY("서명 도입 전");    // 기안자 서명 없이 상신된 예전 문서

    private final String label;

    DocumentIntegrity(String label) { this.label = label; }

    public String getLabel() { return label; }
}
