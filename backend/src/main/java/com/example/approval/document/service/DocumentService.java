package com.example.approval.document.service;

import com.example.approval.document.config.DocumentUploadConfig;
import com.example.approval.document.domain.*;
import com.example.approval.document.dto.DecisionRequest;
import com.example.approval.document.dto.DocumentDetailResponse;
import com.example.approval.document.dto.DocumentRequest;
import com.example.approval.document.dto.DocumentSummaryResponse;
import com.example.approval.document.dto.SignatureRequest;
import com.example.approval.document.dto.SignatureVerificationResponse;
import com.example.approval.document.repository.ApprovalDocumentRepository;
import com.example.approval.document.repository.ApprovalLineRepository;
import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.exception.ApiException;
import com.example.approval.repository.UserRepository;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.*;

@Service
public class DocumentService {

    public static final int MAX_APPROVERS = 5;
    private static final int MAX_TITLE = 100;
    private static final int MAX_CONTENT = 5000;
    private static final long MAX_AMOUNT = 1_000_000_000L;

    private final ApprovalDocumentRepository documentRepository;
    private final ApprovalLineRepository lineRepository;
    private final UserRepository userRepository;
    private final FileStorageService fileStorage;
    private final DocumentSignatureService signatureService;

    public DocumentService(ApprovalDocumentRepository documentRepository,
                           ApprovalLineRepository lineRepository,
                           UserRepository userRepository,
                           FileStorageService fileStorage,
                           DocumentSignatureService signatureService) {
        this.documentRepository = documentRepository;
        this.lineRepository = lineRepository;
        this.userRepository = userRepository;
        this.fileStorage = fileStorage;
        this.signatureService = signatureService;
    }

    // ============================== 작성 / 수정 ==============================

    /**
     * 새 문서 작성 (임시저장).
     * 상신은 기안자 전자서명이 필요하므로 저장 후 submit(...) 으로 따로 요청한다.
     */
    @Transactional
    public DocumentDetailResponse create(String loginId, DocumentRequest req, List<MultipartFile> files) {
        User writer = currentUser(loginId);
        rejectUnsignedSubmit(req);
        if (req.type() == null) {
            throw badRequest("문서 종류를 선택하세요.");
        }
        ApprovalDocument doc = new ApprovalDocument(writer, req.type());
        applyRequest(doc, writer, req, files);
        documentRepository.save(doc);
        documentRepository.flush(); // 새 결재선/첨부파일 ID를 응답에 담기 위해 즉시 저장
        return DocumentDetailResponse.of(doc, writer);
    }

    /** 임시저장 문서 수정 */
    @Transactional
    public DocumentDetailResponse update(String loginId, Long id, DocumentRequest req, List<MultipartFile> files) {
        User writer = currentUser(loginId);
        rejectUnsignedSubmit(req);
        ApprovalDocument doc = findDocument(id);
        if (!doc.isWrittenBy(writer)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "본인이 작성한 문서만 수정할 수 있습니다.");
        }
        if (!doc.isDraft()) {
            throw new ApiException(HttpStatus.CONFLICT, "임시저장 상태의 문서만 수정할 수 있습니다.");
        }
        if (req.type() == null) {
            throw badRequest("문서 종류를 선택하세요.");
        }
        applyRequest(doc, writer, req, files);
        documentRepository.flush(); // 새 결재선/첨부파일 ID를 응답에 담기 위해 즉시 저장
        return DocumentDetailResponse.of(doc, writer);
    }

    /** 예전 방식(저장과 동시에 서명 없이 상신)은 거부 */
    private static void rejectUnsignedSubmit(DocumentRequest req) {
        if (req != null && req.submit()) {
            throw badRequest("상신은 기안자 전자서명이 필요합니다. 임시저장 후 전자서명으로 상신하세요.");
        }
    }

    /**
     * 상신 = 기안자 전자서명 (서명 사슬의 첫 고리).
     * 양식 필수 항목 확인 → 기안자 서명 검증 → 문서번호 발급 → 첫 결재자에게 차례.
     */
    @Transactional
    public DocumentDetailResponse submit(String loginId, Long id, SignatureRequest req) {
        User writer = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        if (!doc.isWrittenBy(writer)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "본인이 작성한 문서만 상신할 수 있습니다.");
        }
        if (!doc.isDraft()) {
            throw new ApiException(HttpStatus.CONFLICT, "임시저장 상태의 문서만 상신할 수 있습니다.");
        }
        validateForSubmit(doc);
        LineSignature signature = signatureService.verifyNewSignature(writer, doc, 0,
                DocumentSignatureService.Action.SUBMIT, null, DocumentSignatureService.NO_PREVIOUS,
                req == null ? null : req.signature(),
                req == null ? null : req.signedAt(),
                req == null ? null : req.certificateSerial());
        String number = doc.getDocNumber() != null ? doc.getDocNumber() : nextDocNumber(doc.getType());
        doc.submit(number, signature);
        documentRepository.flush();
        return DocumentDetailResponse.of(doc, writer);
    }

    /** 요청 내용을 문서에 반영: 검증 → 내용 → 결재선 → 첨부파일 */
    private void applyRequest(ApprovalDocument doc, User writer, DocumentRequest req, List<MultipartFile> files) {
        List<MultipartFile> newFiles = files == null ? List.of()
                : files.stream().filter(f -> f != null && !f.isEmpty()).toList();

        validate(req);

        doc.changeContent(req.type(), req.title().strip(), trimToNull(req.content()),
                req.amount(), req.expenseDate(), req.expenseCategory(),
                req.leaveType(), req.leaveStartDate(), req.leaveEndDate());

        doc.replaceApprovers(resolveApprovers(writer, req.approverIdsOrEmpty()));

        // 기존 첨부 삭제 (DB는 지금, 실제 파일은 커밋 성공 후)
        Set<Long> removeIds = new HashSet<>(req.removedAttachmentIdsOrEmpty());
        List<Attachment> toRemove = doc.getAttachments().stream()
                .filter(a -> removeIds.contains(a.getId()))
                .toList();
        toRemove.forEach(doc::removeAttachment);
        deleteFilesAfterCommit(toRemove.stream().map(Attachment::getStoredName).toList());

        // 새 첨부 추가
        if (doc.getAttachments().size() + newFiles.size() > DocumentUploadConfig.MAX_FILE_COUNT) {
            throw badRequest("첨부파일은 최대 " + DocumentUploadConfig.MAX_FILE_COUNT + "개까지 올릴 수 있습니다.");
        }
        List<String> savedNow = new ArrayList<>();
        deleteFilesIfRollback(savedNow);
        for (MultipartFile file : newFiles) {
            FileStorageService.StoredFile stored = fileStorage.store(file);
            savedNow.add(stored.storedName());
            doc.addAttachment(new Attachment(
                    stored.originalName(), stored.storedName(), stored.contentType(), stored.size(), stored.sha256()));
        }
    }

    // ============================== 회수 / 삭제 ==============================

    @Transactional
    public DocumentDetailResponse withdraw(String loginId, Long id) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        if (!doc.isWrittenBy(user)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "본인이 상신한 문서만 회수할 수 있습니다.");
        }
        doc.withdraw();
        documentRepository.flush();
        return DocumentDetailResponse.of(doc, user);
    }

    @Transactional
    public void delete(String loginId, Long id) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        if (!doc.isWrittenBy(user)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "본인이 작성한 문서만 삭제할 수 있습니다.");
        }
        if (!doc.isDraft()) {
            throw new ApiException(HttpStatus.CONFLICT, "임시저장 문서만 삭제할 수 있습니다. 상신한 문서는 먼저 회수하세요.");
        }
        deleteFilesAfterCommit(doc.getAttachments().stream().map(Attachment::getStoredName).toList());
        documentRepository.delete(doc);
    }

    // ============================== 결재 (승인 / 반려) ==============================

    private static final int MAX_COMMENT = 500;

    /**
     * 승인·반려 = 결재자 전자서명을 서명 사슬에 추가하는 것.
     *  1) 지금까지의 서명 사슬(기안 + 앞 결재자들)을 먼저 자동 검증 → 하나라도 깨져 있으면 결재 불가
     *  2) 내 서명이 바로 앞 서명을 가리키는지 + 서명값 검증
     *  3) 결재 반영 + 무결성 결과 기록
     * 의견은 서명 원문(comment-sha256)에 들어가므로 앞뒤 공백도 바꾸지 않고 받은 그대로 저장한다.
     */
    @Transactional
    public DocumentDetailResponse decide(String loginId, Long id, boolean approve, DecisionRequest req) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        String comment = req == null ? null : req.comment();
        String opinion = (comment == null || comment.isBlank()) ? null : comment;
        if (opinion != null && opinion.length() > MAX_COMMENT) {
            throw badRequest("결재 의견은 " + MAX_COMMENT + "자 이하로 입력하세요.");
        }
        if (!approve && opinion == null) throw badRequest("반려 사유를 입력하세요.");

        ApprovalLine line = doc.lineToDecide(user); // 내 차례가 아니면 여기서 거절

        SignatureVerificationResponse chain = signatureService.verifyAll(doc);
        if (!DocumentIntegrity.VALID.name().equals(chain.integrity())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "앞선 전자서명 검증에 실패해서 결재할 수 없습니다. (" + chain.summary() + ")");
        }
        String previous = DocumentSignatureService.previousDigest(doc, line.getStepOrder());
        LineSignature signature = signatureService.verifyNewSignature(user, doc, line.getStepOrder(),
                approve ? DocumentSignatureService.Action.APPROVE : DocumentSignatureService.Action.REJECT,
                opinion, previous,
                req == null ? null : req.signature(),
                req == null ? null : req.signedAt(),
                req == null ? null : req.certificateSerial());
        if (approve) {
            doc.approve(user, opinion, signature);
        } else {
            doc.reject(user, opinion, signature);
        }
        doc.recordIntegrity(DocumentIntegrity.VALID, null, LocalDateTime.now());
        documentRepository.flush();
        return DocumentDetailResponse.of(doc, user);
    }

    /** 전자서명 검증 결과 (열람 권한이 있는 사람만). 검증 결과는 문서에 기록된다 */
    @Transactional
    public SignatureVerificationResponse verifySignatures(String loginId, Long id) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        checkReadable(doc, user);
        return applyVerification(doc);
    }

    /** 서명 사슬을 검증하고 결과를 문서의 무결성 필드에 기록 */
    private SignatureVerificationResponse applyVerification(ApprovalDocument doc) {
        SignatureVerificationResponse result = signatureService.verifyAll(doc);
        DocumentIntegrity integrity = DocumentIntegrity.valueOf(result.integrity());
        doc.recordIntegrity(integrity, integrity == DocumentIntegrity.VALID ? null : result.summary(),
                result.checkedAt());
        return result;
    }

    /** 문서를 열 때 자동 검증. 결과가 같고 최근에 확인했다면 DB 쓰기를 생략 */
    private void refreshIntegrity(ApprovalDocument doc) {
        if (doc.isDraft()) return;
        SignatureVerificationResponse result = signatureService.verifyAll(doc);
        DocumentIntegrity integrity = DocumentIntegrity.valueOf(result.integrity());
        boolean recent = doc.getIntegrityCheckedAt() != null
                && doc.getIntegrityCheckedAt().isAfter(result.checkedAt().minus(INTEGRITY_RECHECK_INTERVAL));
        if (integrity != doc.getIntegrity() || !recent) {
            doc.recordIntegrity(integrity, integrity == DocumentIntegrity.VALID ? null : result.summary(),
                    result.checkedAt());
        }
    }

    private static final Duration INTEGRITY_RECHECK_INTERVAL = Duration.ofMinutes(10);

    /** 주기 감사 한 묶음의 결과 */
    public record AuditBatch(long lastId, int checked, List<String> invalidDocuments) {}

    /**
     * 주기 감사(SignatureAuditJob): 상신된 문서의 서명 사슬을 id 순서대로 50건씩 다시 검증해서 기록.
     * 사람이 문서를 열지 않아도 DB 직접 조작 같은 위·변조를 자동으로 찾아낸다.
     */
    @Transactional
    public AuditBatch auditBatch(long afterId) {
        List<ApprovalDocument> docs =
                documentRepository.findTop50ByStatusNotAndIdGreaterThanOrderByIdAsc(DocumentStatus.DRAFT, afterId);
        List<String> invalid = new ArrayList<>();
        long lastId = afterId;
        for (ApprovalDocument doc : docs) {
            SignatureVerificationResponse r = applyVerification(doc);
            if (DocumentIntegrity.INVALID.name().equals(r.integrity())) {
                invalid.add((doc.getDocNumber() == null ? "#" + doc.getId() : doc.getDocNumber()) + " " + r.summary());
            }
            lastId = doc.getId();
        }
        return new AuditBatch(lastId, docs.size(), invalid);
    }

    /** 반려된 문서를 바탕으로 새 임시저장 문서를 만든다 (첨부파일은 다시 올려야 함) */
    @Transactional
    public DocumentDetailResponse copyAsDraft(String loginId, Long id) {
        User user = currentUser(loginId);
        ApprovalDocument src = findDocument(id);
        if (!src.isWrittenBy(user)) throw new ApiException(HttpStatus.FORBIDDEN, "본인 문서만 다시 작성할 수 있습니다.");
        if (src.getStatus() != DocumentStatus.REJECTED) {
            throw new ApiException(HttpStatus.CONFLICT, "반려된 문서만 다시 작성할 수 있습니다.");
        }
        ApprovalDocument copy = new ApprovalDocument(user, src.getType());
        copy.changeContent(src.getType(), src.getTitle(), src.getContent(),
                src.getAmount(), src.getExpenseDate(), src.getExpenseCategory(),
                src.getLeaveType(), src.getLeaveStartDate(), src.getLeaveEndDate());
        copy.replaceApprovers(src.getLines().stream()
                .map(ApprovalLine::getApprover)
                .filter(a -> a.getStatus() == UserStatus.ACTIVE)
                .toList());
        documentRepository.saveAndFlush(copy);
        return DocumentDetailResponse.of(copy, user);
    }

    /** 내가 승인·반려한 문서 (최근 100건) */
    @Transactional(readOnly = true)
    public List<DocumentSummaryResponse> decided(String loginId) {
        User user = currentUser(loginId);
        return lineRepository.findTop100ByApproverAndStatusInOrderByActedAtDesc(
                        user, List.of(LineStatus.APPROVED, LineStatus.REJECTED)).stream()
                .map(ApprovalLine::getDocument)
                .map(DocumentSummaryResponse::from)
                .toList();
    }

    // ============================== 조회 ==============================

    /** 문서 상세. 열 때마다 서명 사슬을 자동 검증해서 무결성 결과를 갱신한다 */
    @Transactional
    public DocumentDetailResponse getDetail(String loginId, Long id) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        checkReadable(doc, user);
        refreshIntegrity(doc);
        return DocumentDetailResponse.of(doc, user);
    }

    /** 내가 작성한 문서 (status 가 null 이면 전체) */
    @Transactional(readOnly = true)
    public List<DocumentSummaryResponse> myDocuments(String loginId, DocumentStatus status) {
        User user = currentUser(loginId);
        List<ApprovalDocument> docs = status == null
                ? documentRepository.findByWriterOrderByIdDesc(user)
                : documentRepository.findByWriterAndStatusOrderByIdDesc(user, status);
        return docs.stream().map(DocumentSummaryResponse::from).toList();
    }

    /** 내가 결재할 차례인 문서 (결재 대기함) */
    @Transactional(readOnly = true)
    public List<DocumentSummaryResponse> inbox(String loginId) {
        User user = currentUser(loginId);
        return lineRepository.findByApproverAndStatusOrderByIdDesc(user, LineStatus.CURRENT).stream()
                .map(ApprovalLine::getDocument)
                .map(DocumentSummaryResponse::from)
                .toList();
    }

    public record AttachmentFile(String originalName, long size, Resource resource) {}

    @Transactional(readOnly = true)
    public AttachmentFile loadAttachment(String loginId, Long documentId, Long attachmentId) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(documentId);
        checkReadable(doc, user);
        Attachment attachment = doc.getAttachments().stream()
                .filter(a -> a.getId().equals(attachmentId))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "첨부파일이 없습니다."));
        return new AttachmentFile(attachment.getOriginalName(), attachment.getSize(),
                fileStorage.load(attachment.getStoredName()));
    }

    // ============================== 검증 ==============================

    /** 임시저장/상신 공통: 형식 검사 */
    private void validate(DocumentRequest req) {
        if (req.title() == null || req.title().isBlank()) {
            throw badRequest("제목을 입력하세요.");
        }
        if (req.title().strip().length() > MAX_TITLE) {
            throw badRequest("제목은 " + MAX_TITLE + "자 이하로 입력하세요.");
        }
        if (req.content() != null && req.content().length() > MAX_CONTENT) {
            throw badRequest("내용은 " + MAX_CONTENT + "자 이하로 입력하세요.");
        }
        if (req.amount() != null && (req.amount() <= 0 || req.amount() > MAX_AMOUNT)) {
            throw badRequest("금액이 올바르지 않습니다.");
        }
        if (req.leaveStartDate() != null && req.leaveEndDate() != null
                && req.leaveEndDate().isBefore(req.leaveStartDate())) {
            throw badRequest("휴가 종료일이 시작일보다 빠를 수 없습니다.");
        }
    }

    /** 상신 전용: 양식별 필수 항목 검사 (임시저장은 비어 있어도 됨) */
    private void validateForSubmit(ApprovalDocument doc) {
        switch (doc.getType()) {
            case GENERAL -> {
                if (doc.getContent() == null) throw badRequest("기안 내용을 입력하세요.");
            }
            case EXPENSE -> {
                if (doc.getAmount() == null) throw badRequest("지출 금액을 입력하세요.");
                if (doc.getExpenseDate() == null) throw badRequest("지출일을 입력하세요.");
                if (doc.getExpenseCategory() == null) throw badRequest("지출 항목을 선택하세요.");
                if (doc.getContent() == null) throw badRequest("지출 사유를 입력하세요.");
            }
            case LEAVE -> {
                if (doc.getLeaveType() == null) throw badRequest("휴가 종류를 선택하세요.");
                if (doc.getLeaveStartDate() == null || doc.getLeaveEndDate() == null) {
                    throw badRequest("휴가 기간을 입력하세요.");
                }
                if (doc.getLeaveType().isHalfDay() && !doc.getLeaveStartDate().equals(doc.getLeaveEndDate())) {
                    throw badRequest("반차는 시작일과 종료일이 같아야 합니다.");
                }
            }
        }
        if (doc.getLines().isEmpty()) {
            throw badRequest("결재자를 1명 이상 지정하세요.");
        }
    }

    /** 결재자 ID → User 변환 + 검사 (본인 제외, 중복 불가, 활성 일반 사용자만) */
    private List<User> resolveApprovers(User writer, List<Long> ids) {
        if (ids.size() > MAX_APPROVERS) {
            throw badRequest("결재자는 최대 " + MAX_APPROVERS + "명까지 지정할 수 있습니다.");
        }
        if (new HashSet<>(ids).size() != ids.size()) {
            throw badRequest("같은 결재자를 두 번 지정할 수 없습니다.");
        }
        List<User> approvers = new ArrayList<>();
        for (Long id : ids) {
            if (id == null) throw badRequest("결재자 정보가 올바르지 않습니다.");
            if (id.equals(writer.getId())) throw badRequest("본인을 결재자로 지정할 수 없습니다.");
            User u = userRepository.findById(id)
                    .orElseThrow(() -> badRequest("존재하지 않는 결재자가 포함되어 있습니다."));
            if (u.getStatus() != UserStatus.ACTIVE || !u.isEmployee()) {
                throw badRequest(u.getName() + "님은 결재자로 지정할 수 없습니다.");
            }
            approvers.add(u);
        }
        return approvers;
    }

    /** 작성자, 결재선에 있는 사람, 관리자만 열람 가능 */
    private void checkReadable(ApprovalDocument doc, User user) {
        boolean allowed = doc.isWrittenBy(user)
                || (!doc.isDraft() && doc.hasApprover(user))
                || user.getRole().canManageUsers();
        if (!allowed) {
            // 문서 존재 여부도 숨기기 위해 404
            throw new ApiException(HttpStatus.NOT_FOUND, "문서를 찾을 수 없습니다.");
        }
    }

    // ============================== 유틸 ==============================

    /** 문서번호: 종류-연도-순번 (예: EXP-2026-0007) */
    private String nextDocNumber(DocumentType type) {
        String prefix = type.getPrefix() + "-" + Year.now().getValue() + "-";
        long next = documentRepository.countByTypeAndDocNumberStartingWith(type, prefix) + 1;
        return prefix + String.format("%04d", next);
    }

    private User currentUser(String loginId) {
        return userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    private ApprovalDocument findDocument(Long id) {
        return documentRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "문서를 찾을 수 없습니다."));
    }

    /** 트랜잭션이 성공적으로 끝난 뒤에만 실제 파일 삭제 (DB 롤백 시 파일은 남겨둠) */
    private void deleteFilesAfterCommit(List<String> storedNames) {
        if (storedNames.isEmpty()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                storedNames.forEach(fileStorage::delete);
            }
        });
    }

    /** 저장 도중 에러로 롤백되면 방금 디스크에 쓴 파일을 지움 (쓰레기 파일 방지) */
    private void deleteFilesIfRollback(List<String> storedNames) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) {
                    storedNames.forEach(fileStorage::delete);
                }
            }
        });
    }

    private static String trimToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.strip();
    }

    private static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }
}
