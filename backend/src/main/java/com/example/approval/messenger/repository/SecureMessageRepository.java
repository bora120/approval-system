package com.example.approval.messenger.repository;

import com.example.approval.domain.User;
import com.example.approval.messenger.domain.SecureMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface SecureMessageRepository extends JpaRepository<SecureMessage, Long> {

    boolean existsByClientMessageId(String clientMessageId);

    /** 두 사람 사이에서 afterId 보다 새 메시지 (오래된 순) — 실시간 갱신(폴링)용 */
    @Query("select m from SecureMessage m"
            + " where ((m.sender = :a and m.receiver = :b) or (m.sender = :b and m.receiver = :a))"
            + " and m.id > :afterId order by m.id asc")
    List<SecureMessage> findBetweenAfter(@Param("a") User a, @Param("b") User b,
                                         @Param("afterId") long afterId, Pageable pageable);

    /** 두 사람 사이에서 beforeId 보다 오래된 메시지 (최신 순) — 처음 열기 / 이전 메시지 더 보기 */
    @Query("select m from SecureMessage m"
            + " where ((m.sender = :a and m.receiver = :b) or (m.sender = :b and m.receiver = :a))"
            + " and m.id < :beforeId order by m.id desc")
    List<SecureMessage> findBetweenBefore(@Param("a") User a, @Param("b") User b,
                                          @Param("beforeId") long beforeId, Pageable pageable);

    // ----- 대화 목록용 집계 (상대 수와 상관없이 쿼리 3번으로 끝냄) -----

    /** [상대 ID, 내가 그 사람에게 보낸 마지막 메시지 ID] */
    @Query("select m.receiver.id, max(m.id) from SecureMessage m where m.sender = :me group by m.receiver.id")
    List<Object[]> lastSentIdPerPartner(@Param("me") User me);

    /** [상대 ID, 그 사람이 나에게 보낸 마지막 메시지 ID] */
    @Query("select m.sender.id, max(m.id) from SecureMessage m where m.receiver = :me group by m.sender.id")
    List<Object[]> lastReceivedIdPerPartner(@Param("me") User me);

    /** [보낸 사람 ID, 내가 안 읽은 메시지 수] */
    @Query("select m.sender.id, count(m) from SecureMessage m"
            + " where m.receiver = :me and m.readAt is null group by m.sender.id")
    List<Object[]> unreadCountPerSender(@Param("me") User me);

    long countByReceiverAndReadAtIsNull(User receiver);

    /** partner 가 나에게 보낸 안 읽은 메시지를 읽음 처리 */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update SecureMessage m set m.readAt = :now"
            + " where m.sender = :partner and m.receiver = :me and m.readAt is null")
    int markRead(@Param("partner") User partner, @Param("me") User me, @Param("now") LocalDateTime now);

    // ============================== 파일함 ==============================

    /** 내가 받은 파일 (최신 순, beforeId 보다 오래된 것) */
    @Query("select m from SecureMessage m where m.receiver = :me and m.fileCipherSize is not null"
            + " and m.id < :beforeId order by m.id desc")
    List<SecureMessage> findReceivedFiles(@Param("me") User me, @Param("beforeId") long beforeId, Pageable pageable);

    /** 내가 보낸 파일 */
    @Query("select m from SecureMessage m where m.sender = :me and m.fileCipherSize is not null"
            + " and m.id < :beforeId order by m.id desc")
    List<SecureMessage> findSentFiles(@Param("me") User me, @Param("beforeId") long beforeId, Pageable pageable);

    /** 보관 기간이 지났는데 아직 지우지 않은 파일 */
    @Query("select m from SecureMessage m where m.fileStoredName is not null and m.fileDeletedAt is null"
            + " and m.fileExpiresAt < :now order by m.id asc")
    List<SecureMessage> findExpiredFiles(@Param("now") LocalDateTime now, Pageable pageable);
}
