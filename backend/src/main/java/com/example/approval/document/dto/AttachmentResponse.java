package com.example.approval.document.dto;

import com.example.approval.document.domain.Attachment;

import java.time.LocalDateTime;

public record AttachmentResponse(
        Long id,
        String originalName,
        long size,
        String sha256,
        LocalDateTime uploadedAt
) {
    public static AttachmentResponse from(Attachment a) {
        return new AttachmentResponse(a.getId(), a.getOriginalName(), a.getSize(), a.getSha256(), a.getUploadedAt());
    }
}
