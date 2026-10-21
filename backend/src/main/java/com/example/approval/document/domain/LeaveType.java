package com.example.approval.document.domain;

public enum LeaveType {
    ANNUAL("연차", false),
    HALF_AM("오전반차", true),
    HALF_PM("오후반차", true),
    SICK("병가", false),
    OTHER("기타", false);

    private final String label;
    private final boolean halfDay;

    LeaveType(String label, boolean halfDay) {
        this.label = label;
        this.halfDay = halfDay;
    }

    public String getLabel() { return label; }
    public boolean isHalfDay() { return halfDay; }
}
