package com.example.approval.dto;

import com.example.approval.domain.Position;
import jakarta.validation.constraints.*;

public record SignupRequest(
        @NotBlank(message = "아이디를 입력하세요.")
        @Pattern(regexp = "^[a-zA-Z0-9_]{4,20}$", message = "아이디는 영문/숫자/_ 4~20자입니다.")
        String loginId,

        @NotBlank(message = "비밀번호를 입력하세요.")
        @Size(min = 8, max = 64, message = "비밀번호는 8~64자입니다.")
        String password,

        @NotBlank(message = "이름을 입력하세요.")
        @Size(max = 30)
        String name,

        @NotBlank(message = "부서를 선택하세요.")
        @Size(max = 50)
        String department,

        @NotNull(message = "직책을 선택하세요.")
        Position position
) {}
