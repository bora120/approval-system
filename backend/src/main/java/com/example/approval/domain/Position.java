package com.example.approval.domain;

/**
 * 직책. requiresApproval = true 인 직책은 가입 후 관리자 승인이 있어야 로그인 가능.
 * (누구나 "대표"로 가입해서 결재 권한을 얻는 걸 막기 위함)
 */
public enum Position {
    STAFF("사원", false),
    TEAM_LEADER("팀장", true),
    DIRECTOR("본부장", true),
    CEO("대표", true);

    private final String label;
    private final boolean requiresApproval;

    Position(String label, boolean requiresApproval) {
        this.label = label;
        this.requiresApproval = requiresApproval;
    }

    public String getLabel() { return label; }
    public boolean requiresApproval() { return requiresApproval; }
}
