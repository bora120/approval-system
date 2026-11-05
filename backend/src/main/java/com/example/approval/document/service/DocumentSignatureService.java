package com.example.approval.document.service;

import com.example.approval.document.domain.ApprovalDocument;
import com.example.approval.document.domain.ApprovalLine;
import com.example.approval.document.domain.Attachment;
import com.example.approval.document.domain.DocumentIntegrity;
import com.example.approval.document.domain.LineSignature;
import com.example.approval.document.domain.LineStatus;
import com.example.approval.document.dto.SignatureVerificationResponse;
import com.example.approval.document.dto.SignatureVerificationResponse.CertificateSummary;
import com.example.approval.document.dto.SignatureVerificationResponse.Check;
import com.example.approval.document.dto.SignatureVerificationResponse.SignatureResult;
import com.example.approval.document.dto.SigningContext;
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
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 결재 전자서명 — 서명 원문 정의, 새 서명 검증, 서명 사슬 전체 재검증.
 *
 * ■ 서명 사슬 (결재 = 전자서명을 차례로 "추가"하는 것)
 *     [0] 기안자 서명(상신) ← [1] 1차 결재자 서명 ← [2] 2차 결재자 서명 ← ...
 *   각 서명 원문에 "바로 앞 서명의 해시(previous-signature-sha256)"가 들어간다.
 *   → 중간 서명을 빼거나 바꾸면 그 뒤의 서명이 모두 검증에 실패한다.
 *   → 2차 결재자는 "기안 내용 + 1차 결재자의 승인"을 확인하고 서명했다는 것까지 증명된다.
 *
 * ■ 서명 원문 (브라우저 features/pki/crypto.ts 의 buildSignedMessage 와 글자 하나까지 같아야 함)
 *   E-APPROVAL-SIGNATURE v2
 *   document-id: 12
 *   document-number: EXP-2026-0001       ← 기안자(step 0)는 상신 전이라 빈 값
 *   document-sha256: (문서 내용 해시)     ← 서명 후 문서가 바뀌면 검증 실패
 *   step: 1                              ← 0 = 기안, 1.. = 결재 순서
 *   action: SUBMIT | APPROVE | REJECT
 *   comment-sha256: (결재 의견 해시)
 *   previous-signature-sha256: (앞 서명 해시 | none)
 *   signer: (로그인 아이디)
 *   certificate-serial: (인증서 일련번호)
 *   signed-at: 2026-11-05T02:30:00.123Z
 *
 * ■ 문서의 유효성 = 서명 사슬 전체의 검증 결과 (DocumentIntegrity)
 *   결재할 때(앞 서명 먼저 검증), 문서를 열 때, 주기 감사(SignatureAuditJob) 때 자동으로 계산된다.
 */
@Service
public class DocumentSignatureService {

    public enum Action {
        SUBMIT("상신"), APPROVE("승인"), REJECT("반려");

        private final String label;

        Action(String label) { this.label = label; }

        public String getLabel() { return label; }
    }

    public static final String VERSION_HEADER = "E-APPROVAL-SIGNATURE v2";
    public static final String NO_PREVIOUS = "none";

    private static final Duration MAX_CLOCK_SKEW = Duration.ofMinutes(5);
    private static final Pattern SIGNED_AT = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z");
    private static final Pattern SERIAL = Pattern.compile("[0-9A-F]{1,40}");
    private static final Pattern SIGNATURE_B64 = Pattern.compile("[A-Za-z0-9+/]{86}==");
    private static final int X509_CACHE_LIMIT = 5000;

    private final UserCertificateRepository certificateRepository;
    private final CaService caService;
    /** 인증서는 한 번 발급되면 바뀌지 않으므로 PEM 파싱 결과를 캐시 (검증 반복 시 비용 절감) */
    private final Map<String, X509Certificate> x509Cache = new ConcurrentHashMap<>();

    public DocumentSignatureService(UserCertificateRepository certificateRepository, CaService caService) {
        this.certificateRepository = certificateRepository;
        this.caService = caService;
    }

    // ================================================================ 서명 원문

    /**
     * 서명 대상 문서 내용(정규화). 상신 후에는 바뀌지 않는 항목만 넣는다.
     * 제목·본문은 줄바꿈 등으로 형식이 깨지지 않게 해시로 넣고,
     * 첨부파일은 업로드 때 계산한 SHA-256 을 넣어 파일 바꿔치기도 잡아낸다.
     */
    public static String canonicalContent(ApprovalDocument d) {
        StringBuilder sb = new StringBuilder(512).append("E-APPROVAL-DOCUMENT v2\n");
        field(sb, "id", d.getId());
        field(sb, "type", d.getType().name());
        field(sb, "writer", d.getWriter().getLoginId());
        field(sb, "title-sha256", PkiCrypto.sha256Hex(nullToEmpty(d.getTitle())));
        field(sb, "content-sha256", PkiCrypto.sha256Hex(nullToEmpty(d.getContent())));
        field(sb, "amount", d.getAmount());
        field(sb, "expense-date", d.getExpenseDate());
        field(sb, "expense-category", d.getExpenseCategory() == null ? null : d.getExpenseCategory().name());
        field(sb, "leave-type", d.getLeaveType() == null ? null : d.getLeaveType().name());
        field(sb, "leave-start", d.getLeaveStartDate());
        field(sb, "leave-end", d.getLeaveEndDate());
        field(sb, "approvers", d.getLines().stream()
                .map(l -> l.getStepOrder() + ":" + l.getApprover().getLoginId())
                .collect(Collectors.joining(",")));
        for (Attachment a : d.getAttachments()) {
            field(sb, "attachment", a.getSha256() + " " + a.getSize());
        }
        return sb.toString();
    }

    public static String documentHash(ApprovalDocument d) {
        return PkiCrypto.sha256Hex(canonicalContent(d));
    }

    public static String signedMessage(long documentId, String documentNumber, String documentHash, int step,
                                       Action action, String comment, String previousSignatureSha256,
                                       String signerLoginId, String certificateSerial, String signedAt) {
        return VERSION_HEADER + "\n"
                + "document-id: " + documentId + "\n"
                + "document-number: " + nullToEmpty(documentNumber) + "\n"
                + "document-sha256: " + documentHash + "\n"
                + "step: " + step + "\n"
                + "action: " + action.name() + "\n"
                + "comment-sha256: " + PkiCrypto.sha256Hex(nullToEmpty(comment)) + "\n"
                + "previous-signature-sha256: " + previousSignatureSha256 + "\n"
                + "signer: " + signerLoginId + "\n"
                + "certificate-serial: " + certificateSerial + "\n"
                + "signed-at: " + signedAt;
    }

    /** 서명 한 건의 해시 = SHA-256(서명 원문 + "\n" + 서명값). 다음 서명이 이 값을 가리킨다 */
    public static String digest(String message, String signature) {
        return PkiCrypto.sha256Hex(message + "\n" + signature);
    }

    // ================================================================ 서명 사슬

    /** 저장된 서명 사슬의 고리 하나 (기안자 서명 또는 결재선 한 칸) */
    private record Link(int step, User signer, Action action, String comment, String expectedNumber,
                        UserCertificate certificate, String message, String signature,
                        LocalDateTime serverTime, boolean decided) {
        boolean signed() { return signature != null; }
    }

    /** 기안자 → 결재 순서대로, 이미 처리된(또는 서명이 붙어 있는) 고리들 */
    private static List<Link> chain(ApprovalDocument d) {
        List<Link> links = new ArrayList<>();
        links.add(new Link(0, d.getWriter(), Action.SUBMIT, null, "", d.getWriterCertificate(),
                d.getWriterSignedMessage(), d.getWriterSignatureValue(), d.getSubmittedAt(), true));
        for (ApprovalLine l : d.getLines()) {
            boolean decided = l.getStatus() == LineStatus.APPROVED || l.getStatus() == LineStatus.REJECTED;
            if (!decided && !l.isSigned()) continue;
            Action action = l.getStatus() == LineStatus.REJECTED ? Action.REJECT : Action.APPROVE;
            links.add(new Link(l.getStepOrder(), l.getApprover(), action, l.getComment(), d.getDocNumber(),
                    l.getCertificate(), l.getSignedMessage(), l.getSignatureValue(), l.getActedAt(), decided));
        }
        return links;
    }

    /** step 번째로 서명할 사람이 가리켜야 할 "앞 서명 해시". 앞 서명이 없으면 null */
    public static String previousDigest(ApprovalDocument d, int step) {
        if (step == 0) return NO_PREVIOUS;
        if (step == 1) {
            return d.isWriterSigned() ? digest(d.getWriterSignedMessage(), d.getWriterSignatureValue()) : null;
        }
        return d.getLines().stream()
                .filter(l -> l.getStepOrder() == step - 1 && l.isSigned())
                .findFirst()
                .map(l -> digest(l.getSignedMessage(), l.getSignatureValue()))
                .orElse(null);
    }

    /** 지금 이 사용자가 서명할 차례라면 서명에 필요한 값. 아니면 null */
    public static SigningContext signingContextFor(ApprovalDocument d, User viewer) {
        if (d.isDraft() && d.isWrittenBy(viewer)) {
            return new SigningContext(0, "", canonicalContent(d), NO_PREVIOUS);
        }
        if (d.isTurnOf(viewer)) {
            int step = d.getCurrentLine().map(ApprovalLine::getStepOrder).orElseThrow();
            String previous = previousDigest(d, step);
            if (previous == null) return null; // 앞 서명이 없는 문서(서명 도입 전) → 결재 불가
            return new SigningContext(step, d.getDocNumber(), canonicalContent(d), previous);
        }
        return null;
    }

    // ================================================================ 새 서명 검증

    /**
     * 상신·승인·반려 요청에 붙은 전자서명을 검증한다.
     * 통과하면 저장할 서명 정보를, 실패하면 예외(400/403)를 던진다.
     */
    public LineSignature verifyNewSignature(User signer, ApprovalDocument doc, int step, Action action,
                                            String comment, String previousSignatureSha256,
                                            String signature, String signedAt, String certificateSerial) {
        if (signature == null || signature.isBlank()) {
            throw badRequest("전자서명이 필요합니다. 인증서 암호를 입력해 서명한 뒤 다시 시도하세요.");
        }
        String serial = certificateSerial == null ? "" : certificateSerial.toUpperCase();
        if (!SERIAL.matcher(serial).matches()) throw badRequest("인증서 일련번호 형식이 올바르지 않습니다.");
        if (!SIGNATURE_B64.matcher(signature).matches()) throw badRequest("서명값 형식이 올바르지 않습니다.");
        if (signedAt == null || !SIGNED_AT.matcher(signedAt).matches()) {
            throw badRequest("서명 시각 형식이 올바르지 않습니다.");
        }
        try {
            if (Duration.between(Instant.parse(signedAt), Instant.now()).abs().compareTo(MAX_CLOCK_SKEW) > 0) {
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
        X509Certificate x509 = x509(cert);
        try {
            x509.checkValidity();
        } catch (GeneralSecurityException e) {
            throw badRequest("인증서 유효기간이 아닙니다. 인증서를 다시 발급받으세요.");
        }
        if (!PkiCrypto.isIssuedBy(x509, caService.certificate())) {
            throw badRequest("사내 인증기관(CA)이 발급한 인증서가 아닙니다.");
        }

        String number = step == 0 ? "" : doc.getDocNumber();
        String message = signedMessage(doc.getId(), number, documentHash(doc), step, action, comment,
                previousSignatureSha256, signer.getLoginId(), serial, signedAt);
        if (!PkiCrypto.verifyBrowserSignature(x509.getPublicKey(), message, signature)) {
            throw badRequest("전자서명 검증에 실패했습니다. 화면을 새로고침한 뒤 다시 서명하세요.");
        }
        return new LineSignature(cert, message, signature);
    }

    // ================================================================ 서명 사슬 재검증

    /** 지금 DB 상태 그대로 서명 사슬 전체를 다시 검증한다 (문서 위·변조 확인) */
    public SignatureVerificationResponse verifyAll(ApprovalDocument doc) {
        LocalDateTime now = LocalDateTime.now();
        String canonical = canonicalContent(doc);
        String currentHash = PkiCrypto.sha256Hex(canonical);

        if (doc.isDraft()) {
            return response(DocumentIntegrity.DRAFT, "상신 전(임시저장) 문서입니다.", now, currentHash, canonical,
                    null, List.of(), List.of());
        }
        if (!doc.isWriterSigned()) {
            return response(DocumentIntegrity.LEGACY,
                    "기안자 전자서명 없이 상신된 문서입니다. (전자서명 도입 전) 회수 후 다시 상신하면 서명됩니다.",
                    now, currentHash, canonical, null, List.of(), List.of());
        }

        X509Certificate ca = null;
        String caError = null;
        try {
            ca = caService.certificate();
        } catch (ApiException e) {
            caError = e.getMessage();
        }

        List<Check> documentChecks = structureChecks(doc);
        List<SignatureResult> results = new ArrayList<>();
        String expectedPrevious = NO_PREVIOUS;
        for (Link link : chain(doc)) {
            results.add(verifyLink(doc, link, expectedPrevious, currentHash, ca, caError));
            expectedPrevious = link.signed() ? digest(link.message(), link.signature()) : "(앞 서명 없음)";
        }

        List<String> failures = new ArrayList<>();
        documentChecks.stream().filter(c -> !c.ok()).forEach(c -> failures.add(c.label()));
        results.stream().filter(r -> !r.valid())
                .forEach(r -> failures.add((r.step() == 0 ? "기안" : r.step() + "차 결재") + " 서명"));
        boolean valid = failures.isEmpty();
        String summary = valid
                ? "기안자부터 " + (results.size() - 1) + "명의 결재자까지 서명 " + results.size() + "건이 모두 유효합니다."
                : "검증 실패: " + String.join(", ", failures);
        return response(valid ? DocumentIntegrity.VALID : DocumentIntegrity.INVALID, summary, now, currentHash,
                canonical, ca == null ? null : ca.getSubjectX500Principal().getName(), documentChecks, results);
    }

    /** 결재선 순서·문서 상태가 정상적인 결재 흐름으로 설명되는지 (DB 에서 상태만 조작한 경우를 잡아냄) */
    private static List<Check> structureChecks(ApprovalDocument doc) {
        List<ApprovalLine> lines = doc.getLines();
        int decided = 0;
        boolean prefix = true;
        boolean seenUndecided = false;
        int current = 0;
        int rejected = 0;
        boolean unsignedDecision = false;
        boolean signedUndecided = false;
        for (ApprovalLine l : lines) {
            boolean isDecided = l.getStatus() == LineStatus.APPROVED || l.getStatus() == LineStatus.REJECTED;
            if (isDecided) {
                decided++;
                if (seenUndecided) prefix = false;
                if (!l.isSigned()) unsignedDecision = true;
            } else {
                seenUndecided = true;
                if (l.isSigned()) signedUndecided = true;
            }
            if (l.getStatus() == LineStatus.CURRENT) current++;
            if (l.getStatus() == LineStatus.REJECTED) rejected++;
        }
        boolean rejectedIsLast = rejected == 0
                || (rejected == 1 && decided > 0 && lines.get(decided - 1).getStatus() == LineStatus.REJECTED);

        boolean statusOk = switch (doc.getStatus()) {
            case IN_PROGRESS -> rejected == 0 && current == 1 && decided < lines.size()
                    && lines.get(decided).getStatus() == LineStatus.CURRENT;
            case APPROVED -> decided == lines.size() && rejected == 0;
            case REJECTED -> rejected == 1 && rejectedIsLast && current == 0;
            case DRAFT -> false;
        };

        List<Check> checks = new ArrayList<>();
        checks.add(new Check("결재 순서", prefix && rejectedIsLast,
                prefix && rejectedIsLast ? "결재가 지정된 순서대로 진행됐습니다." : "결재 순서가 맞지 않습니다. (중간 결재가 비어 있음)"));
        checks.add(new Check("문서 상태 일치", statusOk,
                statusOk ? "문서 상태(" + doc.getStatus().getLabel() + ")가 결재 기록과 맞습니다."
                        : "문서 상태(" + doc.getStatus().getLabel() + ")가 결재 기록과 맞지 않습니다."));
        boolean signaturesOk = !unsignedDecision && !signedUndecided;
        checks.add(new Check("서명 누락 없음", signaturesOk,
                signaturesOk ? "처리된 결재마다 전자서명이 있습니다."
                        : unsignedDecision ? "전자서명 없이 처리된 결재가 있습니다." : "처리되지 않은 결재 칸에 서명이 붙어 있습니다."));
        return checks;
    }

    private SignatureResult verifyLink(ApprovalDocument doc, Link link, String expectedPrevious, String currentHash,
                                       X509Certificate ca, String caError) {
        User signer = link.signer();
        String role = link.step() == 0 ? "기안" : "결재";
        if (!link.signed()) {
            return new SignatureResult(link.step(), role, signer.getName(), positionLabel(signer),
                    link.action().name(), link.action().getLabel(), false, false,
                    "전자서명 없이 처리됐습니다.", List.of(), null, link.serverTime(), null, null, null);
        }

        UserCertificate cert = link.certificate();
        X509Certificate x509 = x509(cert);
        Map<String, String> msg = parseMessage(link.message());
        List<Check> checks = new ArrayList<>(8);

        // 1) 인증서가 우리 CA 가 발급한 것인지
        if (ca == null) {
            checks.add(new Check("인증기관(CA) 서명", false, caError));
        } else {
            boolean ok = PkiCrypto.isIssuedBy(x509, ca);
            checks.add(new Check("인증기관(CA) 서명", ok,
                    ok ? "사내 인증기관이 발급한 인증서입니다." : "신뢰하는 인증기관이 발급한 인증서가 아닙니다."));
        }

        // 2) 서명 당시(서버가 받은 시각) 인증서 유효기간
        boolean inPeriod = false;
        if (link.serverTime() != null) {
            try {
                x509.checkValidity(Date.from(link.serverTime().atZone(ZoneId.systemDefault()).toInstant()));
                inPeriod = true;
            } catch (GeneralSecurityException ignored) {
                // inPeriod = false
            }
        }
        checks.add(new Check("인증서 유효기간", inPeriod,
                inPeriod ? "서명 시점에 유효기간 안이었습니다." : "서명 시점에 유효기간이 아니었습니다."));

        // 3) 폐기 여부: 서명보다 "나중에" 폐기된 것은 괜찮다 (서명 당시엔 유효)
        boolean revokedBefore = cert.getStatus() == CertificateStatus.REVOKED && cert.getRevokedAt() != null
                && (link.serverTime() == null || cert.getRevokedAt().isBefore(link.serverTime()));
        checks.add(new Check("인증서 폐기 여부", !revokedBefore,
                revokedBefore ? "서명 전에 이미 폐기된 인증서입니다."
                        : cert.getStatus() == CertificateStatus.REVOKED
                        ? "서명 이후 재발급으로 폐기됐지만, 서명 당시에는 유효했습니다."
                        : "폐기되지 않은 인증서입니다."));

        // 4) 서명자 = 기안자/결재자 본인
        boolean signerOk = cert.isOwnedBy(signer) && signer.getLoginId().equals(msg.get("signer"))
                && cert.getSerialNumber().equals(msg.get("certificate-serial"));
        checks.add(new Check("서명자 확인", signerOk,
                signerOk ? (link.step() == 0 ? "기안자" : "결재자") + " 본인의 인증서로 서명했습니다."
                        : "서명자와 " + (link.step() == 0 ? "기안자" : "결재자") + "가 일치하지 않습니다."));

        // 5) 결재 기록(문서·순서·상신/승인/반려·의견)이 서명 원문과 같은지
        boolean recordOk = VERSION_HEADER.equals(msg.get(""))
                && String.valueOf(doc.getId()).equals(msg.get("document-id"))
                && nullToEmpty(link.expectedNumber()).equals(msg.get("document-number"))
                && String.valueOf(link.step()).equals(msg.get("step"))
                && link.action().name().equals(msg.get("action"))
                && PkiCrypto.sha256Hex(nullToEmpty(link.comment())).equals(msg.get("comment-sha256"));
        checks.add(new Check("결재 기록 일치", recordOk,
                recordOk ? link.action().getLabel() + " 기록과 의견이 서명 당시와 같습니다."
                        : "문서번호·순서·" + link.action().getLabel() + " 여부·의견 중 서명 이후 바뀐 것이 있습니다."));

        // 6) 문서 내용이 서명 당시와 같은지
        boolean docOk = currentHash.equals(msg.get("document-sha256"));
        checks.add(new Check("문서 위·변조 없음", docOk,
                docOk ? "문서 내용·첨부파일이 서명 당시와 같습니다." : "서명 이후 문서 내용 또는 첨부파일이 바뀌었습니다."));

        // 7) 서명 사슬: 바로 앞 서명을 가리키는지
        boolean chainOk = expectedPrevious.equals(msg.get("previous-signature-sha256"));
        checks.add(new Check("서명 사슬 연결", chainOk,
                chainOk ? (link.step() == 0 ? "사슬의 첫 서명(기안)입니다." : "바로 앞 서명에 정확히 이어져 있습니다.")
                        : "앞 서명이 바뀌었거나 빠져서 사슬이 끊겼습니다."));

        // 8) 서명값 자체 (인증서 공개키로 검증)
        boolean sigOk = PkiCrypto.verifyBrowserSignature(x509.getPublicKey(), link.message(), link.signature());
        checks.add(new Check("전자서명 값", sigOk,
                sigOk ? "인증서 공개키로 서명값을 검증했습니다." : "서명값이 서명 원문과 맞지 않습니다."));

        boolean valid = checks.stream().allMatch(Check::ok);
        String summary = valid ? "전자서명이 유효합니다."
                : "검증 실패: " + checks.stream().filter(c -> !c.ok()).map(Check::label)
                .collect(Collectors.joining(", "));

        return new SignatureResult(link.step(), role, signer.getName(), positionLabel(signer),
                link.action().name(), link.action().getLabel(), true, valid, summary, checks,
                certificateSummary(cert, x509), link.serverTime(), link.message(), link.signature(),
                digest(link.message(), link.signature()));
    }

    // ================================================================ 유틸

    private X509Certificate x509(UserCertificate cert) {
        if (x509Cache.size() > X509_CACHE_LIMIT) x509Cache.clear();
        return x509Cache.computeIfAbsent(cert.getSerialNumber(), s -> PkiCrypto.fromPem(cert.getCertificatePem()));
    }

    private static CertificateSummary certificateSummary(UserCertificate c, X509Certificate x) {
        return new CertificateSummary(c.getSerialNumber(), c.getSubjectDn(), x.getIssuerX500Principal().getName(),
                c.getNotBefore(), c.getNotAfter(), c.getStatus().name(), c.getStatus().getLabel(), c.getRevokedAt(),
                CertificateResponse.ALGORITHM);
    }

    private static SignatureVerificationResponse response(DocumentIntegrity integrity, String summary,
                                                          LocalDateTime now, String hash, String canonical,
                                                          String caSubject, List<Check> documentChecks,
                                                          List<SignatureResult> results) {
        return new SignatureVerificationResponse(integrity.name(), integrity.getLabel(), summary, now, hash,
                canonical, caSubject, documentChecks, results);
    }

    /** 서명 원문 "key: value" 줄들을 Map 으로. 첫 줄(버전 헤더)은 "" 키로 */
    private static Map<String, String> parseMessage(String message) {
        Map<String, String> map = new HashMap<>();
        if (message == null) return map;
        String[] rows = message.split("\n");
        map.put("", rows[0]);
        for (int i = 1; i < rows.length; i++) {
            int idx = rows[i].indexOf(": ");
            if (idx > 0) map.put(rows[i].substring(0, idx), rows[i].substring(idx + 2));
        }
        return map;
    }

    private static void field(StringBuilder sb, String key, Object value) {
        sb.append(key).append(": ").append(value == null ? "" : value).append('\n');
    }

    private static String positionLabel(User u) {
        return u.getPosition() == null ? "" : u.getPosition().getLabel();
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }

    private static ApiException badRequest(String m) { return new ApiException(HttpStatus.BAD_REQUEST, m); }
}
