package com.example.approval.document.domain;

public enum ExpenseCategory {
    MEAL("식대"),
    TRANSPORT("교통비"),
    SUPPLIES("소모품비"),
    EDUCATION("교육훈련비"),
    ENTERTAINMENT("접대비"),
    OTHER("기타");

    private final String label;

    ExpenseCategory(String label) { this.label = label; }

    public String getLabel() { return label; }
}
