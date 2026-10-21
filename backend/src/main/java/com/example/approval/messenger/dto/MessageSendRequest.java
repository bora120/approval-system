package com.example.approval.messenger.dto;

/**
 * 메시지 전송 요청 (multipart 의 "data" 파트, JSON).
 * 모든 암호 값은 base64 문자열이며 브라우저에서 만들어진다.
 */
public record MessageSendRequest(
        String clientMessageId,
        Long receiverId,
        Long senderKeyId,
        Long receiverKeyId,
        String encKeyForReceiver,
        String encKeyForSender,
        String iv,
        String ciphertext,
        String signature
) {}
