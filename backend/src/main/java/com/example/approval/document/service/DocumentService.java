package com.example.approval.document.service;

import com.example.approval.document.config.DocumentUploadConfig;
import com.example.approval.document.domain.*;
import com.example.approval.document.dto.DocumentDetailResponse;
import com.example.approval.document.dto.DocumentRequest;
import com.example.approval.document.dto.DocumentSummaryResponse;
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

    public DocumentService(ApprovalDocumentRepository documentRepository,
                           ApprovalLineRepository lineRepository,
                           UserRepository userRepository,
                           FileStorageService fileStorage) {
        this.documentRepository = documentRepository;
        this.lineRepository = lineRepository;
        this.userRepository = userRepository;
        this.fileStorage = fileStorage;
    }

    // ============================== 작성 / 수정 ==============================

    /** 새 문서 작성 (임시저장 또는 바로 상신) */
    @Transactional
    public DocumentDetailResponse create(String loginId, DocumentRequest req, List<MultipartFile> files) {
        User writer = currentUser(loginId);
        if (req.type() == null) {
            throw badRequest("문서 종류를 선택하세요.");
        }
        ApprovalDocument doc = new ApprovalDocument(writer, req.type());
        applyRequest(doc, writer, req, files);
        documentRepository.save(doc);
        if (req.submit()) {
            submit(doc);
        }
        documentRepository.flush(); // 새 결재선/첨부파일 ID를 응답에 담기 위해 즉시 저장
        return DocumentDetailResponse.of(doc, writer);
    }

    /** 임시저장 문서 수정 (수정 후 바로 상신도 가능) */
    @Transactional
    public DocumentDetailResponse update(String loginId, Long id, DocumentRequest req, List<MultipartFile> files) {
        User writer = currentUser(loginId);
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
        if (req.submit()) {
            submit(doc);
        }
        documentRepository.flush(); // 새 결재선/첨부파일 ID를 응답에 담기 위해 즉시 저장
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

    private void submit(ApprovalDocument doc) {
        validateForSubmit(doc);
        doc.submit(nextDocNumber(doc.getType()));
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

    @Transactional
    public DocumentDetailResponse decide(String loginId, Long id, boolean approve, String comment) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        String opinion = trimToNull(comment);
        if (opinion != null && opinion.length() > MAX_COMMENT) {
            throw badRequest("결재 의견은 " + MAX_COMMENT + "자 이하로 입력하세요.");
        }
        if (approve) {
            doc.approve(user, opinion);
        } else {
            if (opinion == null) throw badRequest("반려 사유를 입력하세요.");
            doc.reject(user, opinion);
        }
        documentRepository.flush();
        return DocumentDetailResponse.of(doc, user);
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

    @Transactional(readOnly = true)
    public DocumentDetailResponse getDetail(String loginId, Long id) {
        User user = currentUser(loginId);
        ApprovalDocument doc = findDocument(id);
        checkReadable(doc, user);
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
