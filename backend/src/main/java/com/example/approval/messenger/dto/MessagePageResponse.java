package com.example.approval.messenger.dto;

import java.util.List;

/**
 * 대화 메시지 묶음 + 서명 검증에 필요한 공개키들.
 * hasMore: 더 오래된 메시지가 남아 있는지 (이전 메시지 더 보기 버튼용)
 */
public record MessagePageResponse(
        List<MessageResponse> messages,
        List<KeyResponse> keys,
        boolean hasMore
) {}
