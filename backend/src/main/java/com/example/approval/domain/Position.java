package com.example.approval.domain;

/** 직급. 선언 순서는 낮은 직급에서 높은 직급 순서이며 결재선 추천에도 사용한다. */
public enum Position {
    STAFF("사원", false, true),
    JUNIOR("주임", true, true),
    ASSISTANT_MANAGER("대리", true, true),
    MANAGER("과장", true, true),
    DEPUTY_GENERAL_MANAGER("차장", true, true),
    GENERAL_MANAGER("부장", true, true),
    VICE_CEO("부대표", true, false),
    CEO("대표", true, false);

    private final String label;
    private final boolean requiresApproval;
    private final boolean selfSignup;

    Position(String label, boolean requiresApproval, boolean selfSignup) {
        this.label = label;
        this.requiresApproval = requiresApproval;
        this.selfSignup = selfSignup;
    }

    public String getLabel() { return label; }
    public boolean requiresApproval() { return requiresApproval; }
    public boolean allowsSelfSignup() { return selfSignup; }
}
