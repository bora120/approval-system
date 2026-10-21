package com.example.approval.domain;

/**
 * 시스템 권한
 *  - USER        : 일반 사용자
 *  - ADMIN       : 관리자 (가입 승인, 직책 변경). 대표가 지정
 *  - SUPER_ADMIN : 최고 관리자 = 대표. /setup 에서 초기 설정 토큰으로 한 번만 만들 수 있음
 * 회원가입으로는 USER 만 될 수 있다.
 */
public enum Role {
    USER, ADMIN, SUPER_ADMIN;

    /** 관리 페이지(가입 승인·직책 변경)를 쓸 수 있는지 */
    public boolean canManageUsers() { return this == ADMIN || this == SUPER_ADMIN; }
}
