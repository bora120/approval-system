package com.example.approval.messenger.dto;

import com.example.approval.messenger.domain.SecureMessage;

import java.time.LocalDateTime;

public record MessageResponse(
        Long id,
        String clientMessageId,
        Long senderId,
        Long receiverId,
        Long senderKeyId,
        Long receiverKeyId,
        String encKeyForReceiver,
        String encKeyForSender,
        String iv,
        String ciphertext,
        String signature,
        boolean hasFile,
        Long fileCipherSize,
        String fileCipherSha256,
        LocalDateTime fileExpiresAt,
        LocalDateTime fileDownloadedAt,
        LocalDateTime fileDeletedAt,
        String fileDeleteReason,
        LocalDateTime createdAt,
        LocalDateTime readAt
) {
    public static MessageResponse from(SecureMessage m) {
        return new MessageResponse(
                m.getId(),
                m.getClientMessageId(),
                m.getSender().getId(),
                m.getReceiver().getId(),
                m.getSenderKey().getId(),
                m.getReceiverKey().getId(),
                m.getEncKeyForReceiver(),
                m.getEncKeyForSender(),
                m.getIv(),
                m.getCiphertext(),
                m.getSignature(),
                m.hasFile(),
                m.getFileCipherSize(),
                m.getFileCipherSha256(),
                m.getFileExpiresAt(),
                m.getFileDownloadedAt(),
                m.getFileDeletedAt(),
                m.getFileDeleteReason() == null ? null : m.getFileDeleteReason().getLabel(),
                m.getCreatedAt(),
                m.getReadAt());
    }
}
