package com.example.approval.organization.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 최초 대표 등록 요청 */
public record CeoSetupRequest(
        @NotBlank(message = "초기 설정 토큰을 입력하세요.")
        String setupToken,

        @NotBlank(message = "아이디를 입력하세요.")
        @Pattern(regexp = "^[a-zA-Z0-9_]{4,20}$", message = "아이디는 영문/숫자/_ 4~20자입니다.")
        String loginId,

        @NotBlank(message = "비밀번호를 입력하세요.")
        @Size(min = 8, max = 64, message = "비밀번호는 8~64자입니다.")
        String password,

        @NotBlank(message = "이름을 입력하세요.")
        @Size(max = 30, message = "이름은 30자 이하로 입력하세요.")
        String name,

        @NotBlank(message = "부서를 입력하세요.")
        @Size(max = 50, message = "부서는 50자 이하로 입력하세요.")
        String department
) {}
