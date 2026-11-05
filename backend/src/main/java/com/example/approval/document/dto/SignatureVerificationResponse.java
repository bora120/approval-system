package com.example.approval.document.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 문서 한 건의 전자서명 검증 결과 (기안자 → 결재자 서명 사슬 전체).
 *
 * @param integrity        종합 결과 (DocumentIntegrity 이름: DRAFT / VALID / INVALID / LEGACY)
 * @param summary          한 줄 요약 (실패라면 실패 항목)
 * @param documentHash     지금 DB 에 있는 문서 내용으로 다시 계산한 해시
 * @param canonicalContent 해시를 계산한 원문 (서명 대상 문서 내용)
 * @param caSubject        신뢰하는 루트 인증기관 (검증 기준)
 * @param documentChecks   문서 전체 구조 검사 (결재 순서·상태가 서명 기록과 맞는지)
 * @param signatures       서명별 검증 결과 (0 = 기안, 1.. = 결재 순서)
 */
public record SignatureVerificationResponse(
        String integrity,
        String integrityLabel,
        String summary,
        LocalDateTime checkedAt,
        String documentHash,
        String canonicalContent,
        String caSubject,
        List<Check> documentChecks,
        List<SignatureResult> signatures
) {
    public record SignatureResult(
            int step,
            String role,            // 기안 / 결재
            String signerName,
            String signerPositionLabel,
            String action,          // SUBMIT / APPROVE / REJECT
            String actionLabel,
            boolean signed,
            boolean valid,
            String summary,
            List<Check> checks,
            CertificateSummary certificate,
            LocalDateTime signedAt, // 서버가 받은 시각 (상신일 / 결재일)
            String signedMessage,
            String signature,
            String signatureDigest  // 이 서명의 해시 = 다음 서명의 previous-signature-sha256
    ) {}

    /** 검증 항목 하나 (예: "문서 위·변조 없음" ✔) */
    public record Check(String label, boolean ok, String detail) {}

    public record CertificateSummary(
            String serialNumber,
            String subject,
            String issuer,
            LocalDateTime notBefore,
            LocalDateTime notAfter,
            String status,
            String statusLabel,
            LocalDateTime revokedAt,
            String algorithm
    ) {}
}
