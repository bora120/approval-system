package com.example.approval.document.dto;

/** 승인/반려 의견 (반려는 사유 필수) */
public record DecisionRequest(String comment) {}
