package com.example.approval.document.dto;

/**
 * 브라우저가 서명 원문을 만들 때 필요한 값 (지금 이 사용자가 서명할 차례일 때만 내려줌).
 *
 * @param step                    서명 순서. 0 = 기안자(상신), 1.. = 결재선 순서
 * @param documentNumber          서명 원문에 넣을 문서번호 (기안자는 아직 발급 전이라 빈 값)
 * @param documentContent         서명 대상 문서 내용(정규화). 브라우저가 이 값의 SHA-256 을 서명 원문에 넣는다
 * @param previousSignatureSha256 바로 앞 서명의 해시 (기안자는 "none") → 서명 사슬 연결
 */
public record SigningContext(int step, String documentNumber, String documentContent,
                             String previousSignatureSha256) {}
