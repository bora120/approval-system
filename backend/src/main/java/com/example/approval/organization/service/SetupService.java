package com.example.approval.organization.service;

import com.example.approval.domain.Position;
import com.example.approval.domain.Role;
import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.dto.UserResponse;
import com.example.approval.exception.ApiException;
import com.example.approval.organization.dto.CeoSetupRequest;
import com.example.approval.organization.dto.SetupStatusResponse;
import com.example.approval.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 최초 대표(최고 관리자) 계정 등록 */
@Service
public class SetupService {

    private static final Logger log = LoggerFactory.getLogger(SetupService.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final SetupTokenService tokenService;

    public SetupService(UserRepository userRepository, PasswordEncoder passwordEncoder, SetupTokenService tokenService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
    }

    @Transactional(readOnly = true)
    public SetupStatusResponse status() {
        return new SetupStatusResponse(tokenService.isSetupOpen(), tokenService.tokenFromEnv());
    }

    /**
     * 대표 계정 생성. 대표가 이미 있으면 거부.
     * (동시에 두 번 요청되는 경우는 컨트롤러에서 잠금으로 막는다)
     */
    @Transactional
    public UserResponse registerCeo(CeoSetupRequest req) {
        if (!tokenService.isSetupOpen()) {
            throw new ApiException(HttpStatus.CONFLICT, "대표 계정이 이미 등록되어 최초 설정이 닫혔습니다.");
        }
        tokenService.verify(req.setupToken());
        if (userRepository.existsByLoginId(req.loginId())) {
            throw new ApiException(HttpStatus.CONFLICT, "이미 사용 중인 아이디입니다.");
        }
        User ceo = new User(req.loginId(), passwordEncoder.encode(req.password()), req.name().strip(),
                req.department().strip(), Position.CEO, Role.SUPER_ADMIN, UserStatus.ACTIVE);
        userRepository.save(ceo);
        log.info("대표 계정이 등록되었습니다: {}", ceo.getLoginId());
        return UserResponse.from(ceo);
    }
}
