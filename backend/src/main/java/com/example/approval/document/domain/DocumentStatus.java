package com.example.approval.document.domain;

public enum DocumentStatus {
    DRAFT("임시저장"),
    IN_PROGRESS("진행중"),
    APPROVED("승인완료"),
    REJECTED("반려");

    private final String label;

    DocumentStatus(String label) { this.label = label; }

    public String getLabel() { return label; }
}
