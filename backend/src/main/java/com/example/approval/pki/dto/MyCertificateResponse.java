package com.example.approval.pki.dto;

/** 내 현재 인증서. 발급받은 적이 없거나 만료·폐기됐으면 certificate 가 null */
public record MyCertificateResponse(CertificateResponse certificate) {}
