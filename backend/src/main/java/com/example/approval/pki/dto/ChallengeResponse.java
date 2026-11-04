package com.example.approval.pki.dto;

/** 인증서 발급용 1회용 난수. 발급 요청문에 넣어 서명하게 해서 재전송(replay)을 막는다 */
public record ChallengeResponse(String challenge, String loginId) {}
