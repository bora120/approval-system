package com.example.approval.document.dto;

/**
 * 승인/반려 요청 (반려는 사유 필수).
 *
 * @param comment           결재 의견
 * @param signature         서명 원문에 대한 ECDSA 서명값 (r||s, Base64)
 * @param signedAt          브라우저가 서명한 시각 (ISO-8601 UTC, 예: 2026-11-04T14:30:00.123Z)
 * @param certificateSerial 서명에 쓴 인증서 일련번호
 */
public record DecisionRequest(String comment, String signature, String signedAt, String certificateSerial) {}
