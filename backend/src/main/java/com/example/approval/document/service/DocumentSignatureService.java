package com.example.approval.document.service;

import com.example.approval.document.domain.ApprovalDocument;
import com.example.approval.document.domain.ApprovalLine;
import com.example.approval.document.domain.Attachment;
import com.example.approval.document.domain.LineSignature;
import com.example.approval.document.domain.LineStatus;
import com.example.approval.document.dto.DecisionRequest;
import com.example.approval.document.dto.SignatureVerificationResponse;
import com.example.approval.document.dto.SignatureVerificationResponse.CertificateSummary;
import com.example.approval.document.dto.SignatureVerificationResponse.Check;
import com.example.approval.document.dto.SignatureVerificationResponse.LineResult;
import com.example.approval.domain.User;
import com.example.approval.exception.ApiException;
import com.example.approval.pki.crypto.PkiCrypto;
import com.example.approval.pki.domain.CertificateStatus;
import com.example.approval.pki.domain.UserCertificate;
import com.example.approval.pki.dto.CertificateResponse;
import com.example.approval.pki.repository.UserCertificateRepository;
import com.example.approval.pki.service.CaService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.security.GeneralSecurityException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 결재 전자서명 — 서명 원문 만들기, 결재할 때 검증, 나중에 다시 검증.
 *
 * 서명 원문 (브라우저 features/pki/crypto.ts 의 buildSignedMessage 와 글자 하나까지 같아야 함)
 *   E-APPROVAL-SIGNATURE v1
 *   document-id: 12
 *   document-number: GEN-2026-0001
 *   document-sha256: (문서 내용 해시)      ← 결재 후 문서가 바뀌면 검증 실패
 *   step: 2
 *   decision: APPROVE | REJECT
 *   comment-sha256: (결재 의견 해시)
 *   signer: (결재자 로그인 아이디)
 *   certificate-serial: (인증서 일련번호)
 *   signed-at: 2026-11-04T14:30:00.123Z
 *
 * 보안 성질
 *   - 무결성: 문서 내용·결재 의견이 해시로 서명에 묶여 있다.
 *   - 인증·부인방지: 결재자 브라우저에만 있는 개인키로만 만들 수 있고, CA 가 발급한 인증서로 검증한다.
 *   - 서버(관리자)도 결재자 개인키가 없으므로 결재 기록을 위조할 수 없다.
 */
@Service
public class DocumentSignatureService {

    private static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);
    private static final Pattern SIGNED_AT = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z");
    private static final Pattern SERIAL = Pattern.compile("[0-9A-F]{1,40}");
    private static final Pattern SIGNATURE_B64 = Pattern.compile("[A-Za-z0-9+/]{86}==");
    private static final DateTimeFormatter SECONDS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final UserCertificateRepository certificateRepository;
    private final CaService caService;

    public DocumentSignatureService(UserCertificateRepository certificateRepository, CaService caService) {
        this.certificateRepository = certificateRepository;
        this.caService = caService;
    }

    // ============================== 서명 원문 ==============================

    /**
     * 서명 대상 문서 내용. 상신 후에는 바뀌지 않는 항목만 넣는다.
     * 제목·본문은 줄바꿈 등으로 형식이 깨지지 않게 해시로 넣는다.
     * 첨부파일은 업로드 때 계산한 SHA-256 을 넣어서, 파일 바꿔치기도 잡아낸다.
     */
    public static String canonicalContent(ApprovalDocument d) {
        StringBuilder sb = new StringBuilder("E-APPROVAL-DOCUMENT v1\n");
        line(sb, "id", d.getId());
        line(sb, "number", d.getDocNumber());
        line(sb, "type", d.getType().name());
        line(sb, "writer", d.getWriter().getLoginId());
        line(sb, "submitted-at", d.getSubmittedAt() == null ? null : d.getSubmittedAt().format(SECONDS));
        line(sb, "title-sha256", PkiCrypto.sha256Hex(nullToEmpty(d.getTitle())));
        line(sb, "content-sha256", PkiCrypto.sha256Hex(nullToEmpty(d.getContent())));
        line(sb, "amount", d.getAmount());
        line(sb, "expense-date", d.getExpenseDate());
        line(sb, "expense-category", d.getExpenseCategory() == null ? null : d.getExpenseCategory().name());
        line(sb, "leave-type", d.getLeaveType() == null ? null : d.getLeaveType().name());
        line(sb, "leave-start", d.getLeaveStartDate());
        line(sb, "leave-end", d.getLeaveEndDate());
        line(sb, "approvers", d.getLines().stream()
                .map(l -> l.getStepOrder() + ":" + l.getApprover().getLoginId())
                .collect(Collectors.joining(",")));
        for (Attachment a : d.getAttachments()) {
            line(sb, "attachment", a.getSha256() + " " + a.getSize());
        }
        return sb.toString();
    }

    public static String documentHash(ApprovalDocument d) {
        return PkiCrypto.sha256Hex(canonicalContent(d));
    }

    public static String signedMessage(long documentId, String documentNumber, String documentHash, int step,
                                       boolean approve, String comment, String signerLoginId,
                                       String certificateSerial, String signedAt) {
        return "E-APPROVAL-SIGNATURE v1\n"
                + "document-id: " + documentId + "\n"
                + "document-number: " + nullToEmpty(documentNumber) + "\n"
                + "document-sha256: " + documentHash + "\n"
                + "step: " + step + "\n"
                + "decision: " + (approve ? "APPROVE" : "REJECT") + "\n"
                + "comment-sha256: " + PkiCrypto.sha256Hex(nullToEmpty(comment)) + "\n"
                + "signer: " + signerLoginId + "\n"
                + "certificate-serial: " + certificateSerial + "\n"
                + "signed-at: " + signedAt;
    }

    // ============================== 결재할 때 검증 ==============================

    /** 승인·반려 요청의 전자서명을 검증한다. 통과하면 저장할 서명 정보를, 실패하면 예외를 던진다 */
    public LineSignature verifyDecision(User signer, ApprovalDocument doc, ApprovalLine line,
                                        boolean approve, String comment, DecisionRequest req) {
        if (req == null || req.signature() == null || req.signature().isBlank()) {
            throw badRequest("전자서명이 필요합니다. 인증서 암호를 입력해 서명한 뒤 다시 시도하세요.");
        }
        String serial = req.certificateSerial() == null ? "" : req.certificateSerial().toUpperCase();
        if (!SERIAL.matcher(serial).matches()) throw badRequest("인증서 일련번호 형식이 올바르지 않습니다.");
        if (!SIGNATURE_B64.matcher(req.signature()).matches()) throw badRequest("서명값 형식이 올바르지 않습니다.");

        String signedAt = req.signedAt() == null ? "" : req.signedAt();
        if (!SIGNED_AT.matcher(signedAt).matches()) throw badRequest("서명 시각 형식이 올바르지 않습니다.");
        try {
            Duration skew = Duration.between(Instant.parse(signedAt), Instant.now()).abs();
            if (skew.compareTo(MAX_CLOCK_SKEW) > 0) {
                throw badRequest("서명 시각이 서버 시각과 5분 넘게 차이 납니다. PC 시계를 확인하고 다시 서명하세요.");
            }
        } catch (DateTimeParseException e) {
            throw badRequest("서명 시각 형식이 올바르지 않습니다.");
        }

        UserCertificate cert = certificateRepository.findBySerialNumber(serial)
                .orElseThrow(() -> badRequest("서명에 쓴 인증서를 찾을 수 없습니다."));
        if (!cert.isOwnedBy(signer)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "본인 인증서로만 서명할 수 있습니다.");
        }
        if (cert.getStatus() != CertificateStatus.VALID) {
            throw badRequest("폐기된 인증서입니다. 인증서 관리에서 다시 발급받으세요.");
        }
        X509Certificate x509 = PkiCrypto.fromPem(cert.getCertificatePem());
        try {
            x509.checkValidity();
        } catch (GeneralSecurityException e) {
            throw badRequest("인증서 유효기간이 아닙니다. 인증서를 다시 발급받으세요.");
        }
        if (!PkiCrypto.isIssuedBy(x509, caService.certificate())) {
            throw badRequest("사내 인증기관(CA)이 발급한 인증서가 아닙니다.");
        }

        String message = signedMessage(doc.getId(), doc.getDocNumber(), documentHash(doc), line.getStepOrder(),
                approve, comment, signer.getLoginId(), serial, signedAt);
        if (!PkiCrypto.verifyBrowserSignature(x509.getPublicKey(), message, req.signature())) {
            throw badRequest("전자서명 검증에 실패했습니다. 화면을 새로고침한 뒤 다시 서명하세요.");
        }
        return new LineSignature(cert, message, req.signature());
    }

    // ============================== 나중에 다시 검증 ==============================

    /** 문서의 모든 결재 서명을 지금 DB 상태 기준으로 다시 검증한다 (위·변조 확인) */
    public SignatureVerificationResponse verifyAll(ApprovalDocument doc) {
        String canonical = canonicalContent(doc);
        String currentHash = PkiCrypto.sha256Hex(canonical);

        X509Certificate ca = null;
        String caError = null;
        try {
            ca = caService.certificate();
        } catch (ApiException e) {
            caError = e.getMessage();
        }

        List<LineResult> results = new ArrayList<>();
        for (ApprovalLine line : doc.getLines()) {
            if (line.getStatus() != LineStatus.APPROVED && line.getStatus() != LineStatus.REJECTED) continue;
            results.add(verifyLine(doc, line, currentHash, ca, caError));
        }
        return new SignatureVerificationResponse(currentHash, canonical,
                ca == null ? null : ca.getSubjectX500Principal().getName(), results);
    }

    private LineResult verifyLine(ApprovalDocument doc, ApprovalLine line, String currentHash,
                                  X509Certificate ca, String caError) {
        User approver = line.getApprover();
        boolean approve = line.getStatus() == LineStatus.APPROVED;

        if (!line.isSigned()) {
            return new LineResult(line.getStepOrder(), approver.getName(), positionLabel(approver),
                    line.getStatus().name(), line.getStatus().getLabel(), false, false,
                    "전자서명 없이 처리된 결재입니다. (전자서명 도입 전 기록)",
                    List.of(), null, line.getActedAt(), null, null);
        }

        UserCertificate cert = line.getCertificate();
        X509Certificate x509 = PkiCrypto.fromPem(cert.getCertificatePem());
        Map<String, String> msg = parseMessage(line.getSignedMessage());
        Date actedAt = Date.from(line.getActedAt().atZone(ZoneId.systemDefault()).toInstant());
        List<Check> checks = new ArrayList<>();

        // 1) 인증서가 우리 CA 가 발급한 것인지 (CA 서명 검증)
        if (ca == null) {
            checks.add(new Check("인증기관(CA) 서명", false, caError));
        } else {
            boolean ok = PkiCrypto.isIssuedBy(x509, ca);
            checks.add(new Check("인증기관(CA) 서명", ok,
                    ok ? "사내 인증기관이 발급한 인증서입니다." : "신뢰하는 인증기관이 발급한 인증서가 아닙니다."));
        }

        // 2) 서명 당시 인증서 유효기간
        boolean inPeriod;
        try {
            x509.checkValidity(actedAt);
            inPeriod = true;
        } catch (GeneralSecurityException e) {
            inPeriod = false;
        }
        checks.add(new Check("인증서 유효기간", inPeriod,
                inPeriod ? "서명 시점에 유효기간 안이었습니다." : "서명 시점에 유효기간이 아니었습니다."));

        // 3) 폐기 여부: 서명보다 "나중에" 폐기된 것은 괜찮다 (서명 당시엔 유효)
        boolean revokedBefore = cert.getStatus() == CertificateStatus.REVOKED
                && cert.getRevokedAt() != null && cert.getRevokedAt().isBefore(line.getActedAt());
        checks.add(new Check("인증서 폐기 여부", !revokedBefore,
                revokedBefore ? "서명 전에 이미 폐기된 인증서입니다."
                        : cert.getStatus() == CertificateStatus.REVOKED
                        ? "서명 이후 재발급으로 폐기됐지만, 서명 당시에는 유효했습니다."
                        : "폐기되지 않은 인증서입니다."));

        // 4) 서명자 = 결재자
        boolean signerOk = cert.isOwnedBy(approver) && approver.getLoginId().equals(msg.get("signer"))
                && cert.getSerialNumber().equals(msg.get("certificate-serial"));
        checks.add(new Check("서명자 확인", signerOk,
                signerOk ? "결재자 본인의 인증서로 서명했습니다." : "서명자와 결재자가 일치하지 않습니다."));

        // 5) 결재 내용(문서 번호·순서·승인/반려·의견)이 서명 원문과 같은지
        boolean decisionOk = String.valueOf(doc.getId()).equals(msg.get("document-id"))
                && nullToEmpty(doc.getDocNumber()).equals(msg.get("document-number"))
                && String.valueOf(line.getStepOrder()).equals(msg.get("step"))
                && (approve ? "APPROVE" : "REJECT").equals(msg.get("decision"))
                && PkiCrypto.sha256Hex(nullToEmpty(line.getComment())).equals(msg.get("comment-sha256"));
        checks.add(new Check("결재 기록 일치", decisionOk,
                decisionOk ? "승인/반려 결과와 결재 의견이 서명 당시와 같습니다."
                        : "결재 결과나 의견이 서명 이후에 바뀌었습니다."));

        // 6) 문서 내용이 서명 당시와 같은지
        boolean docOk = currentHash.equals(msg.get("document-sha256"));
        checks.add(new Check("문서 위·변조 없음", docOk,
                docOk ? "문서 내용·첨부파일이 서명 당시와 같습니다."
                        : "서명 이후 문서 내용 또는 첨부파일이 바뀌었습니다."));

        // 7) 서명값 자체 (인증서 공개키로 검증)
        boolean sigOk = PkiCrypto.verifyBrowserSignature(x509.getPublicKey(), line.getSignedMessage(),
                line.getSignatureValue());
        checks.add(new Check("전자서명 값", sigOk,
                sigOk ? "인증서 공개키로 서명값을 검증했습니다." : "서명값이 서명 원문과 맞지 않습니다."));

        boolean valid = checks.stream().allMatch(Check::ok);
        String summary = valid ? "전자서명이 유효합니다."
                : "검증 실패: " + checks.stream().filter(c -> !c.ok()).map(Check::label)
                .collect(Collectors.joining(", "));

        CertificateResponse info = CertificateResponse.from(cert);
        CertificateSummary summaryCert = new CertificateSummary(info.serialNumber(), info.subject(), info.issuer(),
                info.notBefore(), info.notAfter(), info.status(), info.statusLabel(), info.revokedAt(),
                info.algorithm());

        return new LineResult(line.getStepOrder(), approver.getName(), positionLabel(approver),
                line.getStatus().name(), line.getStatus().getLabel(), true, valid, summary, checks, summaryCert,
                line.getActedAt(), line.getSignedMessage(), line.getSignatureValue());
    }

    // ============================== 유틸 ==============================

    private static Map<String, String> parseMessage(String message) {
        Map<String, String> map = new HashMap<>();
        if (message == null) return map;
        for (String row : message.split("\n")) {
            int i = row.indexOf(": ");
            if (i > 0) map.put(row.substring(0, i), row.substring(i + 2));
        }
        return map;
    }

    private static void line(StringBuilder sb, String key, Object value) {
        sb.append(key).append(": ").append(value == null ? "" : value).append('\n');
    }

    private static String positionLabel(User u) {
        return u.getPosition() == null ? "" : u.getPosition().getLabel();
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }

    private static ApiException badRequest(String m) { return new ApiException(HttpStatus.BAD_REQUEST, m); }
}
