package com.example.approval.document.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 문서 한 건의 전자서명 검증 결과.
 *
 * @param documentHash     지금 DB 에 있는 문서 내용으로 다시 계산한 해시
 * @param canonicalContent 해시를 계산한 원문 (서명 대상 문서 내용)
 * @param caSubject        신뢰하는 루트 인증기관 (검증 기준)
 * @param signatures       결재선별 검증 결과 (승인·반려한 칸만)
 */
public record SignatureVerificationResponse(
        String documentHash,
        String canonicalContent,
        String caSubject,
        List<LineResult> signatures
) {
    public record LineResult(
            int stepOrder,
            String signerName,
            String signerPositionLabel,
            String decision,       // APPROVED / REJECTED
            String decisionLabel,
            boolean signed,
            boolean valid,
            String summary,
            List<Check> checks,
            CertificateSummary certificate,
            LocalDateTime actedAt,
            String signedMessage,
            String signature
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
