package com.example.approval.messenger.dto;

import java.util.List;

/** 파일함 목록 + 서명 검증용 공개키 */
public record FilePageResponse(
        List<FileItemResponse> items,
        List<KeyResponse> keys,
        boolean hasMore
) {}
