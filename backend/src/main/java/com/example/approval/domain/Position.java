package com.example.approval.domain;

/**
 * 직책. 선언 순서 = 직급 순서 (낮은 직책 → 높은 직책). 기본 결재선 추천에 이 순서를 사용하므로 순서를 지킬 것.
 * requiresApproval = true 인 직책은 가입 후 관리자 승인이 있어야 로그인 가능.
 * selfSignup = false 인 직책(부대표·대표)은 회원가입으로 고를 수 없고 대표만 지정할 수 있다.
 */
public enum Position {
    STAFF("사원", false, true),
    TEAM_LEADER("팀장", true, true),
    DIRECTOR("본부장", true, true),
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
