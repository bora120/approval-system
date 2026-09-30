package com.example.approval.controller;

import com.example.approval.domain.User;
import com.example.approval.dto.LoginRequest;
import com.example.approval.dto.SignupRequest;
import com.example.approval.dto.SignupResponse;
import com.example.approval.dto.UserResponse;
import com.example.approval.exception.ApiException;
import com.example.approval.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(AuthService authService,
                          AuthenticationManager authenticationManager,
                          SecurityContextRepository securityContextRepository) {
        this.authService = authService;
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
    }

    /** 회원가입 */
    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public SignupResponse signup(@Valid @RequestBody SignupRequest req) {
        return authService.signup(req);
    }

    /** 로그인: 성공하면 세션(JSESSIONID 쿠키)에 인증 정보 저장 */
    @PostMapping("/login")
    public UserResponse login(@Valid @RequestBody LoginRequest req,
                              HttpServletRequest request, HttpServletResponse response) {
        // 1) 아이디/비밀번호 검증 (틀리면 아이디가 틀렸는지 비번이 틀렸는지 구분하지 않음)
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(req.loginId(), req.password()));
        } catch (AuthenticationException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        // 2) 비밀번호가 맞은 뒤에 가입 승인 상태 확인
        User user = authService.getByLoginId(req.loginId());
        switch (user.getStatus()) {
            case PENDING -> throw new ApiException(HttpStatus.FORBIDDEN, "관리자 승인 대기 중인 계정입니다.");
            case REJECTED -> throw new ApiException(HttpStatus.FORBIDDEN, "가입이 거절된 계정입니다. 관리자에게 문의하세요.");
            case ACTIVE -> { }
        }

        // 3) 세션 고정 공격 방지: 로그인 시 세션 ID 새로 발급
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }

        // 4) 인증 정보를 세션에 저장
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        return UserResponse.from(user);
    }

    /** 현재 로그인한 사용자 정보 (새로고침 시 로그인 유지 확인용) */
    @GetMapping("/me")
    public UserResponse me(Authentication authentication) {
        return UserResponse.from(authService.getByLoginId(authentication.getName()));
    }

    // 로그아웃(POST /api/auth/logout)은 SecurityConfig에서 처리
}
