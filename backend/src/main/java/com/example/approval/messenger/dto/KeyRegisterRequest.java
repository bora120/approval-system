package com.example.approval.messenger.dto;

/** 공개키 등록 요청: 브라우저에서 만든 공개키 2개 (JWK JSON 문자열) */
public record KeyRegisterRequest(String encPublicKey, String sigPublicKey) {}
