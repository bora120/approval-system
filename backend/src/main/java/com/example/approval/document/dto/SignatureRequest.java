package com.example.approval.document.dto;

/**
 * 상신(기안자 서명) 요청.
 *
 * @param signature         서명 원문에 대한 ECDSA 서명값 (r||s, Base64)
 * @param signedAt          브라우저가 서명한 시각 (ISO-8601 UTC)
 * @param certificateSerial 서명에 쓴 인증서 일련번호
 */
public record SignatureRequest(String signature, String signedAt, String certificateSerial) {}
