package com.example.approval.messenger.dto;

/** 파일함 한 줄: 암호화된 메시지(파일 이름은 그 안에 있음) + 상대 정보 */
public record FileItemResponse(
        MessageResponse message,
        ContactResponse partner,
        boolean mine
) {}
