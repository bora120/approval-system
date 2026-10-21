package com.example.approval.organization.service;

import com.example.approval.domain.Role;
import com.example.approval.exception.ApiException;
import com.example.approval.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * 최초 대표 등록용 "초기 설정 토큰" 관리.
 *
 *  - 환경변수 CEO_SETUP_TOKEN (= app.setup.token) 이 있으면 그 값을 쓴다.
 *  - 없으면 서버가 시작할 때 무작위 토큰을 만들어 백엔드 터미널에 한 번 출력한다.
 *    (서버에 접근할 수 있는 사람만 알 수 있음 → 아무나 대표가 되는 것을 막음)
 *  - 대표가 한 명이라도 생기면 설정 화면은 영구히 닫힌다.
 *  - 토큰을 10번 틀리면 10분 동안 잠근다 (무차별 대입 방지).
 */
@Service
public class SetupTokenService {

    private static final Logger log = LoggerFactory.getLogger(SetupTokenService.class);
    private static final int MAX_FAILURES = 10;
    private static final Duration LOCK_TIME = Duration.ofMinutes(10);

    private final UserRepository userRepository;
    private final String configuredToken;
    private final String generatedToken;

    private int failures = 0;
    private Instant lockedUntil = Instant.EPOCH;

    public SetupTokenService(UserRepository userRepository, @Value("${app.setup.token:}") String configuredToken) {
        this.userRepository = userRepository;
        this.configuredToken = configuredToken == null ? "" : configuredToken.strip();
        this.generatedToken = this.configuredToken.isEmpty() ? randomToken() : null;
    }

    /** 대표가 아직 없어서 최초 설정을 할 수 있는지 */
    public boolean isSetupOpen() {
        return !userRepository.existsByRole(Role.SUPER_ADMIN);
    }

    /** 토큰을 환경변수로 정했는지 (아니면 터미널에 출력된 자동 생성 토큰) */
    public boolean tokenFromEnv() {
        return !configuredToken.isEmpty();
    }

    /** 서버 준비가 끝나면 설정 안내를 출력 */
    @EventListener(ApplicationReadyEvent.class)
    public void printSetupGuide() {
        if (!isSetupOpen()) return;
        String token = configuredToken.isEmpty()
                ? generatedToken
                : "(환경변수 CEO_SETUP_TOKEN 에 설정한 값)";
        log.warn("""

                ==================================================================
                  아직 대표 계정이 없습니다. 브라우저에서 최초 설정을 진행하세요.
                    주소  : http://localhost:3000/setup
                    토큰  : {}
                  (대표 계정을 만들면 이 토큰은 더 이상 쓸 수 없습니다)
                ==================================================================""", token);
    }

    /** 토큰 확인. 틀리면 예외 */
    public synchronized void verify(String input) {
        Instant now = Instant.now();
        if (now.isBefore(lockedUntil)) {
            long minutes = Math.max(1, Duration.between(now, lockedUntil).toMinutes());
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "토큰을 여러 번 잘못 입력했습니다. " + minutes + "분 뒤에 다시 시도하세요.");
        }
        String expected = configuredToken.isEmpty() ? generatedToken : configuredToken;
        boolean ok = input != null && MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8), input.strip().getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            failures++;
            if (failures >= MAX_FAILURES) {
                failures = 0;
                lockedUntil = now.plus(LOCK_TIME);
                log.warn("초기 설정 토큰 입력이 {}회 실패하여 {}분간 잠급니다.", MAX_FAILURES, LOCK_TIME.toMinutes());
            }
            throw new ApiException(HttpStatus.FORBIDDEN, "초기 설정 토큰이 올바르지 않습니다.");
        }
        failures = 0;
    }

    private static String randomToken() {
        byte[] bytes = new byte[18]; // 144비트 → base64url 24글자
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
