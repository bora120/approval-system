package com.example.approval.messenger.dto;

import java.time.LocalDateTime;

/** 대화 목록 한 줄 (내용은 암호화돼 있어 서버가 미리보기를 만들 수 없음) */
public record ConversationResponse(
        ContactResponse partner,
        Long lastMessageId,
        LocalDateTime lastMessageAt,
        boolean lastFromMe,
        boolean lastHasFile,
        long unreadCount
) {}
