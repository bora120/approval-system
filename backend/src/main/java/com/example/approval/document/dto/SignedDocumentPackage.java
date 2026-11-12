package com.example.approval.document.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 전자서명 문서 원본 (서명 원본 저장 .json).
 *
 * 문서 내용 + 서명 사슬 전체 + 서명자 인증서 + 루트 CA 인증서를 한 파일에 담는다.
 * 시스템 밖에서도(시스템이 없어져도) 이 파일만으로 "누가, 무엇에, 어떤 순서로 서명했는지"를 다시 검증할 수 있다.
 */
public record SignedDocumentPackage(
        String format,
        LocalDateTime exportedAt,
        String exportedBy,
        Document document,
        String canonicalContent,       // 서명 대상 문서 내용(정규화)
        String documentSha256,         // = SHA-256(canonicalContent)
        List<Signature> signatures,    // 0 = 기안, 1.. = 결재 순서 (서명 사슬)
        String caCertificatePem,       // 신뢰 기준 (사내 루트 CA)
        Verification verification,     // 내보낸 시점의 서버 검증 결과
        List<String> howToVerify
) {
    public static final String FORMAT = "E-APPROVAL-SIGNED-DOCUMENT v1";

    public record Document(
            Long id, String docNumber, String type, String typeLabel, String status, String statusLabel,
            String title, String content,
            String writerLoginId, String writerName, String writerDepartment, String writerPosition,
            Long amount, LocalDate expenseDate, String expenseCategory,
            String leaveType, LocalDate leaveStartDate, LocalDate leaveEndDate,
            LocalDateTime submittedAt, LocalDateTime completedAt,
            List<Line> approvalLines, List<Attachment> attachments
    ) {}

    public record Line(int stepOrder, String approverLoginId, String approverName, String approverPosition,
                       String status, String comment, LocalDateTime actedAt) {}

    public record Attachment(String name, long size, String sha256) {}

    public record Signature(
            int step, String role, String signerLoginId, String signerName, String action,
            LocalDateTime signedAt, String signedMessage, String signatureValue, String signatureSha256,
            String certificateSerial, String certificatePem
    ) {}

    public record Verification(String integrity, String integrityLabel, String summary, LocalDateTime checkedAt) {}
}
