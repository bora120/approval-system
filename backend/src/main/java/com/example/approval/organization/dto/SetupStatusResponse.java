package com.example.approval.organization.dto;

/**
 * available      : 지금 최초 대표 등록을 할 수 있는지
 * tokenFromEnv   : 토큰을 환경변수로 정했는지 (false 면 백엔드 터미널에 출력된 토큰 사용)
 */
public record SetupStatusResponse(boolean available, boolean tokenFromEnv) {}
