package com.example.approval.document.domain;

/** 결재 문서 종류(양식). prefix는 문서번호 앞자리 (예: EXP-2026-0001) */
public enum DocumentType {
    GENERAL("기안서", "GEN"),
    EXPENSE("지출결의서", "EXP"),
    LEAVE("휴가신청서", "LEV");

    private final String label;
    private final String prefix;

    DocumentType(String label, String prefix) {
        this.label = label;
        this.prefix = prefix;
    }

    public String getLabel() { return label; }
    public String getPrefix() { return prefix; }
}
