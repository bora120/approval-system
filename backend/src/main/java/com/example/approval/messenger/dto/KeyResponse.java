package com.example.approval.messenger.dto;

import com.example.approval.messenger.domain.MessengerKey;

import java.time.LocalDateTime;

public record KeyResponse(
        Long keyId,
        Long userId,
        String encPublicKey,
        String sigPublicKey,
        String fingerprint,
        boolean active,
        LocalDateTime createdAt
) {
    public static KeyResponse from(MessengerKey k) {
        return new KeyResponse(k.getId(), k.getUser().getId(), k.getEncPublicKey(), k.getSigPublicKey(),
                k.getFingerprint(), k.isActive(), k.getCreatedAt());
    }
}
