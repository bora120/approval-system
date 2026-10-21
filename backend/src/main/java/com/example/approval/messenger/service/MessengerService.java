package com.example.approval.messenger.service;

import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.exception.ApiException;
import com.example.approval.messenger.MessengerLimits;
import com.example.approval.messenger.domain.FileDeleteReason;
import com.example.approval.messenger.domain.MessengerKey;
import com.example.approval.messenger.domain.SecureMessage;
import com.example.approval.messenger.dto.*;
import com.example.approval.messenger.repository.MessengerKeyRepository;
import com.example.approval.messenger.repository.SecureMessageRepository;
import com.example.approval.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 1:1 종단간 암호화 메신저.
 * 서버는 암호문을 저장·중계만 하고, "누가 누구에게 언제" 보냈는지만 안다.
 */
@Service
public class MessengerService {

    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern BASE64 = Pattern.compile("^[A-Za-z0-9+/]+={0,2}$");

    private static final Logger log = LoggerFactory.getLogger(MessengerService.class);

    private final UserRepository userRepository;
    private final SecureMessageRepository messageRepository;
    private final MessengerKeyRepository keyRepository;
    private final MessengerKeyService keyService;
    private final EncryptedFileStorage fileStorage;
    private final int fileRetentionDays;

    public MessengerService(UserRepository userRepository,
                            SecureMessageRepository messageRepository,
                            MessengerKeyRepository keyRepository,
                            MessengerKeyService keyService,
                            EncryptedFileStorage fileStorage,
                            @Value("${app.messenger.file-retention-days:7}") int fileRetentionDays) {
        this.userRepository = userRepository;
        this.messageRepository = messageRepository;
        this.keyRepository = keyRepository;
        this.keyService = keyService;
        this.fileStorage = fileStorage;
        this.fileRetentionDays = Math.max(1, fileRetentionDays);
    }

    // ============================== 사용자 / 키 ==============================

    @Transactional(readOnly = true)
    public User currentUser(String loginId) {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(HttpStatus.FORBIDDEN, "승인된 계정만 메신저를 사용할 수 있습니다.");
        }
        return user;
    }

    @Transactional(readOnly = true)
    public Optional<KeyResponse> myKey(String loginId) {
        return keyService.activeKeyOf(currentUser(loginId)).map(KeyResponse::from);
    }

    @Transactional
    public KeyResponse registerKey(String loginId, KeyRegisterRequest req) {
        return keyService.register(currentUser(loginId), req);
    }

    @Transactional(readOnly = true)
    public KeyResponse contactKey(String loginId, Long userId) {
        currentUser(loginId);
        User target = findUser(userId);
        return keyService.activeKeyOf(target)
                .map(KeyResponse::from)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND,
                        target.getName() + "님은 아직 메신저 보안 키를 만들지 않았습니다. 메신저에 한 번 접속해야 메시지를 받을 수 있어요."));
    }

    /** 대화 상대 목록: 승인된 사용자 중 본인 제외, 이름/부서 검색 */
    @Transactional(readOnly = true)
    public List<ContactResponse> contacts(String loginId, String keyword) {
        User me = currentUser(loginId);
        String k = keyword == null ? "" : keyword.strip().toLowerCase(Locale.ROOT);

        List<User> users = userRepository.findAllByStatusOrderByCreatedAtAsc(UserStatus.ACTIVE).stream()
                .filter(u -> !u.getId().equals(me.getId()))
                .filter(u -> k.isEmpty()
                        || u.getName().toLowerCase(Locale.ROOT).contains(k)
                        || (u.getDepartment() != null && u.getDepartment().toLowerCase(Locale.ROOT).contains(k)))
                .sorted(Comparator.comparing(User::getName))
                .limit(100)
                .toList();

        Map<Long, String> fingerprints = activeFingerprints(users);
        return users.stream().map(u -> ContactResponse.of(u, fingerprints.get(u.getId()))).toList();
    }

    // ============================== 대화 목록 ==============================

    /**
     * 대화 목록. 상대가 몇 명이든 집계 쿼리 3번 + 메시지/사용자 일괄 조회 2번으로 끝낸다.
     * (예전 방식은 상대 1명마다 쿼리 2번 → 대화가 많을수록 느려짐)
     */
    @Transactional(readOnly = true)
    public List<ConversationResponse> conversations(String loginId) {
        User me = currentUser(loginId);

        // 상대별 마지막 메시지 ID (보낸 것 / 받은 것 중 큰 값)
        Map<Long, Long> lastIdByPartner = new HashMap<>();
        for (List<Object[]> rows : List.of(messageRepository.lastSentIdPerPartner(me),
                                           messageRepository.lastReceivedIdPerPartner(me))) {
            for (Object[] r : rows) {
                lastIdByPartner.merge(((Number) r[0]).longValue(), ((Number) r[1]).longValue(), Math::max);
            }
        }
        lastIdByPartner.remove(me.getId());
        if (lastIdByPartner.isEmpty()) return List.of();

        Map<Long, Long> unreadBySender = new HashMap<>();
        for (Object[] r : messageRepository.unreadCountPerSender(me)) {
            unreadBySender.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
        }

        Map<Long, User> partners = new HashMap<>();
        userRepository.findAllById(lastIdByPartner.keySet()).forEach(u -> partners.put(u.getId(), u));
        Map<Long, SecureMessage> lastById = new HashMap<>();
        messageRepository.findAllById(lastIdByPartner.values()).forEach(m -> lastById.put(m.getId(), m));
        Map<Long, String> fingerprints = activeFingerprints(partners.values());

        List<ConversationResponse> result = new ArrayList<>();
        lastIdByPartner.forEach((partnerId, lastId) -> {
            User partner = partners.get(partnerId);
            SecureMessage last = lastById.get(lastId);
            if (partner == null || last == null) return;
            result.add(new ConversationResponse(
                    ContactResponse.of(partner, fingerprints.get(partnerId)),
                    last.getId(),
                    last.getCreatedAt(),
                    last.isSentBy(me),
                    last.hasFile(),
                    unreadBySender.getOrDefault(partnerId, 0L)));
        });
        result.sort(Comparator.comparing(ConversationResponse::lastMessageId).reversed());
        return result;
    }

    @Transactional(readOnly = true)
    public long unreadCount(String loginId) {
        return messageRepository.countByReceiverAndReadAtIsNull(currentUser(loginId));
    }

    // ============================== 메시지 조회 ==============================

    /**
     * 대화 메시지 조회 (항상 오래된 순으로 반환)
     *  - afterId 지정: 그보다 새 메시지 (실시간 갱신용)
     *  - beforeId 지정: 그보다 오래된 메시지 (이전 메시지 더 보기)
     *  - 둘 다 없음: 가장 최근 메시지들
     */
    @Transactional(readOnly = true)
    public MessagePageResponse messages(String loginId, Long partnerId, Long afterId, Long beforeId, Integer limit) {
        User me = currentUser(loginId);
        User partner = findUser(partnerId);
        int size = limit == null ? MessengerLimits.DEFAULT_PAGE_SIZE
                : Math.max(1, Math.min(limit, MessengerLimits.MAX_PAGE_SIZE));

        List<SecureMessage> list;
        boolean hasMore = false;
        if (afterId != null) {
            list = messageRepository.findBetweenAfter(me, partner, afterId, PageRequest.of(0, size));
        } else {
            long before = beforeId == null ? Long.MAX_VALUE : beforeId;
            List<SecureMessage> desc = new ArrayList<>(
                    messageRepository.findBetweenBefore(me, partner, before, PageRequest.of(0, size + 1)));
            if (desc.size() > size) {
                hasMore = true;
                desc = new ArrayList<>(desc.subList(0, size));
            }
            Collections.reverse(desc);
            list = desc;
        }

        // 서명 검증용: 메시지를 보낸 사람들의 (그 당시) 공개키
        Set<Long> keyIds = list.stream().map(m -> m.getSenderKey().getId()).collect(Collectors.toSet());
        List<KeyResponse> keys = keyIds.isEmpty() ? List.of()
                : keyRepository.findByIdIn(keyIds).stream().map(KeyResponse::from).toList();

        return new MessagePageResponse(list.stream().map(MessageResponse::from).toList(), keys, hasMore);
    }

    /** partner 가 보낸 메시지를 읽음 처리 */
    @Transactional
    public int markRead(String loginId, Long partnerId) {
        User me = currentUser(loginId);
        User partner = findUser(partnerId);
        return messageRepository.markRead(partner, me, LocalDateTime.now());
    }

    // ============================== 전송 ==============================

    @Transactional
    public MessageResponse send(String loginId, MessageSendRequest req, MultipartFile file) {
        User me = currentUser(loginId);
        if (req == null) throw badRequest("요청 형식이 올바르지 않습니다.");

        // --- 기본 검사 ---
        if (req.clientMessageId() == null || !UUID_PATTERN.matcher(req.clientMessageId()).matches()) {
            throw badRequest("메시지 ID 형식이 올바르지 않습니다.");
        }
        if (req.receiverId() == null) throw badRequest("받는 사람을 선택하세요.");
        if (req.receiverId().equals(me.getId())) throw badRequest("자기 자신에게는 보낼 수 없습니다.");

        User receiver = findUser(req.receiverId());
        if (receiver.getStatus() != UserStatus.ACTIVE) {
            throw badRequest(receiver.getName() + "님에게는 메시지를 보낼 수 없습니다.");
        }

        checkBase64(req.encKeyForReceiver(), MessengerLimits.MAX_RSA_VALUE_LENGTH, "암호화 키");
        checkBase64(req.encKeyForSender(), MessengerLimits.MAX_RSA_VALUE_LENGTH, "암호화 키");
        checkBase64(req.signature(), MessengerLimits.MAX_RSA_VALUE_LENGTH, "서명");
        checkBase64(req.ciphertext(), MessengerLimits.MAX_CIPHERTEXT_LENGTH, "암호문");
        checkBase64(req.iv(), MessengerLimits.IV_LENGTH, "IV");
        if (req.iv().length() != MessengerLimits.IV_LENGTH) throw badRequest("IV 형식이 올바르지 않습니다.");

        // --- 키 버전 확인: 반드시 "현재" 키로 암호화했어야 함 ---
        MessengerKey myKey = keyService.activeKeyOf(me)
                .orElseThrow(() -> conflict("내 보안 키가 없습니다. 메신저 화면을 새로고침하세요."));
        MessengerKey receiverKey = keyService.activeKeyOf(receiver)
                .orElseThrow(() -> badRequest(receiver.getName() + "님은 아직 메신저 보안 키를 만들지 않았습니다."));
        if (!myKey.getId().equals(req.senderKeyId())) {
            throw conflict("내 보안 키가 바뀌었습니다. 새로고침 후 다시 보내 주세요.");
        }
        if (!receiverKey.getId().equals(req.receiverKeyId())) {
            throw conflict("상대방의 보안 키가 바뀌었습니다. 다시 보내 주세요.");
        }

        // --- 재전송(replay) 차단 ---
        if (messageRepository.existsByClientMessageId(req.clientMessageId())) {
            throw conflict("이미 전송된 메시지입니다.");
        }

        SecureMessage message = new SecureMessage(
                req.clientMessageId(), me, receiver, myKey, receiverKey,
                req.encKeyForReceiver(), req.encKeyForSender(),
                req.iv(), req.ciphertext(), req.signature());

        // --- 첨부파일 (이미 암호화된 상태) ---
        if (file != null && !file.isEmpty()) {
            EncryptedFileStorage.StoredBlob blob = fileStorage.store(file);
            deleteIfRollback(blob.storedName());
            message.attachFile(blob.storedName(), blob.size(), blob.sha256(),
                    LocalDateTime.now().plusDays(fileRetentionDays));
        }

        messageRepository.saveAndFlush(message);
        return MessageResponse.from(message);
    }

    // ============================== 첨부파일 다운로드 / 삭제 ==============================

    public record EncryptedFile(long size, Resource resource) {}

    /** 암호화된 첨부파일 내려받기. 받는 사람이 처음 받으면 수신 확인을 기록한다 */
    @Transactional
    public EncryptedFile loadFile(String loginId, Long messageId) {
        User me = currentUser(loginId);
        SecureMessage message = findParticipantMessage(me, messageId);
        if (!message.hasFile()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "첨부파일이 없는 메시지입니다.");
        }
        LocalDateTime now = LocalDateTime.now();
        if (!message.isFileAvailable(now)) {
            throw new ApiException(HttpStatus.GONE, "삭제되었거나 보관 기간이 지난 파일입니다.");
        }
        Resource resource = fileStorage.load(message.getFileStoredName());
        if (!message.isSentBy(me)) {
            message.markFileDownloaded(now);
        }
        return new EncryptedFile(message.getFileCipherSize(), resource);
    }

    /**
     * 첨부파일 삭제. 보낸 사람이면 "전송 취소", 받는 사람이면 "삭제".
     * 메시지 기록(누가 언제 보냈는지)은 남기고 암호문 파일만 지운다.
     */
    @Transactional
    public MessageResponse deleteFile(String loginId, Long messageId) {
        User me = currentUser(loginId);
        SecureMessage message = findParticipantMessage(me, messageId);
        if (!message.hasFile()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "첨부파일이 없는 메시지입니다.");
        }
        if (message.getFileDeletedAt() == null) {
            FileDeleteReason reason = message.isSentBy(me)
                    ? FileDeleteReason.CANCELED_BY_SENDER
                    : FileDeleteReason.DELETED_BY_RECEIVER;
            message.markFileDeleted(reason, LocalDateTime.now());
            deleteAfterCommit(message.getFileStoredName());
        }
        return MessageResponse.from(message);
    }

    // ============================== 파일함 ==============================

    /** box = received(받은 파일) | sent(보낸 파일) */
    @Transactional(readOnly = true)
    public FilePageResponse files(String loginId, String box, Long beforeId, Integer limit) {
        User me = currentUser(loginId);
        boolean sent = "sent".equalsIgnoreCase(box);
        if (!sent && box != null && !"received".equalsIgnoreCase(box)) {
            throw badRequest("box 는 received 또는 sent 여야 합니다.");
        }
        int size = limit == null ? MessengerLimits.DEFAULT_PAGE_SIZE
                : Math.max(1, Math.min(limit, MessengerLimits.MAX_PAGE_SIZE));
        long before = beforeId == null ? Long.MAX_VALUE : beforeId;

        List<SecureMessage> list = new ArrayList<>(sent
                ? messageRepository.findSentFiles(me, before, PageRequest.of(0, size + 1))
                : messageRepository.findReceivedFiles(me, before, PageRequest.of(0, size + 1)));
        boolean hasMore = list.size() > size;
        if (hasMore) list = new ArrayList<>(list.subList(0, size));

        Set<User> partners = new HashSet<>();
        for (SecureMessage m : list) partners.add(sent ? m.getReceiver() : m.getSender());
        Map<Long, String> fingerprints = activeFingerprints(partners);

        List<FileItemResponse> items = list.stream().map(m -> {
            User partner = sent ? m.getReceiver() : m.getSender();
            return new FileItemResponse(MessageResponse.from(m),
                    ContactResponse.of(partner, fingerprints.get(partner.getId())), sent);
        }).toList();

        Set<Long> keyIds = list.stream().map(m -> m.getSenderKey().getId()).collect(Collectors.toSet());
        List<KeyResponse> keys = keyIds.isEmpty() ? List.of()
                : keyRepository.findByIdIn(keyIds).stream().map(KeyResponse::from).toList();

        return new FilePageResponse(items, keys, hasMore);
    }

    /** 보관 기간이 지난 파일 정리 (스케줄러가 주기적으로 호출). 지운 개수를 돌려준다 */
    @Transactional
    public int purgeExpiredFiles() {
        LocalDateTime now = LocalDateTime.now();
        List<SecureMessage> expired = messageRepository.findExpiredFiles(now, PageRequest.of(0, 500));
        for (SecureMessage m : expired) {
            m.markFileDeleted(FileDeleteReason.EXPIRED, now);
            deleteAfterCommit(m.getFileStoredName());
        }
        if (!expired.isEmpty()) log.info("보관 기간이 지난 메신저 파일 {}개를 삭제했습니다.", expired.size());
        return expired.size();
    }

    // ============================== 유틸 ==============================

    private User findUser(Long id) {
        if (id == null) throw badRequest("사용자 정보가 없습니다.");
        return userRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
    }

    private SecureMessage findParticipantMessage(User me, Long messageId) {
        return messageRepository.findById(messageId)
                .filter(m -> m.isParticipant(me))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "메시지를 찾을 수 없습니다."));
    }

    /** DB 변경이 성공적으로 저장된 뒤에만 실제 파일을 지운다 */
    private void deleteAfterCommit(String storedName) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            fileStorage.delete(storedName);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                fileStorage.delete(storedName);
            }
        });
    }

    private Map<Long, String> activeFingerprints(Collection<User> users) {
        if (users.isEmpty()) return Map.of();
        Map<Long, String> map = new HashMap<>();
        for (MessengerKey k : keyRepository.findByUserInAndActiveTrue(users)) {
            map.put(k.getUser().getId(), k.getFingerprint());
        }
        return map;
    }

    private static void checkBase64(String value, int maxLength, String label) {
        if (value == null || value.isEmpty() || value.length() > maxLength || !BASE64.matcher(value).matches()) {
            throw badRequest(label + " 값이 올바르지 않습니다.");
        }
    }

    /** DB 저장이 실패(롤백)하면 방금 저장한 첨부파일을 지운다 */
    private void deleteIfRollback(String storedName) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) fileStorage.delete(storedName);
            }
        });
    }

    private static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }

    private static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, message);
    }
}
