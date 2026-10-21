package com.example.approval.document.domain;

/** 결재선 한 칸(결재자 1명)의 상태 */
public enum LineStatus {
    WAITING("대기"),      // 아직 차례가 아님
    CURRENT("결재차례"),   // 지금 이 사람이 결재할 차례
    APPROVED("승인"),
    REJECTED("반려");

    private final String label;

    LineStatus(String label) { this.label = label; }

    public String getLabel() { return label; }
}
