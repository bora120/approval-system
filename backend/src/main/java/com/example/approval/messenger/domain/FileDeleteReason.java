package com.example.approval.messenger.domain;

/** 첨부파일이 지워진 이유 */
public enum FileDeleteReason {
    CANCELED_BY_SENDER("보낸 사람이 전송을 취소했습니다"),
    DELETED_BY_RECEIVER("받는 사람이 삭제했습니다"),
    EXPIRED("보관 기간이 지나 자동 삭제되었습니다");

    private final String label;

    FileDeleteReason(String label) { this.label = label; }

    public String getLabel() { return label; }
}
