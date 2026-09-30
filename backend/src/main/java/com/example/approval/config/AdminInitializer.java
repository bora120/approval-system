package com.example.approval.config;

import com.example.approval.domain.Role;
import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** 서버 시작 시 관리자 계정이 없으면 하나 만든다. */
@Component
public class AdminInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminInitializer.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminLoginId;
    private final String adminPassword;

    public AdminInitializer(UserRepository userRepository, PasswordEncoder passwordEncoder,
                            @Value("${app.admin.login-id}") String adminLoginId,
                            @Value("${app.admin.password}") String adminPassword) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminLoginId = adminLoginId;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(String... args) {
        if (userRepository.existsByLoginId(adminLoginId)) return;

        userRepository.save(new User(
                adminLoginId,
                passwordEncoder.encode(adminPassword),
                "관리자",
                "경영지원팀",
                null,
                Role.ADMIN,
                UserStatus.ACTIVE));
        log.warn("관리자 계정 생성됨: {} (application.yml의 비밀번호를 꼭 바꾸세요)", adminLoginId);
    }
}
