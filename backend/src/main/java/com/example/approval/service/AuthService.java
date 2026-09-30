package com.example.approval.service;

import com.example.approval.domain.Role;
import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.dto.SignupRequest;
import com.example.approval.dto.SignupResponse;
import com.example.approval.dto.UserResponse;
import com.example.approval.exception.ApiException;
import com.example.approval.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /** 회원가입: 사원은 바로 ACTIVE, 팀장 이상은 PENDING(관리자 승인 필요) */
    @Transactional
    public SignupResponse signup(SignupRequest req) {
        if (userRepository.existsByLoginId(req.loginId())) {
            throw new ApiException(HttpStatus.CONFLICT, "이미 사용 중인 아이디입니다.");
        }

        UserStatus status = req.position().requiresApproval() ? UserStatus.PENDING : UserStatus.ACTIVE;

        User user = new User(
                req.loginId(),
                passwordEncoder.encode(req.password()),
                req.name(),
                req.department(),
                req.position(),
                Role.USER,          // 가입으로는 절대 ADMIN이 될 수 없음
                status);
        userRepository.save(user);

        String message = (status == UserStatus.PENDING)
                ? req.position().getLabel() + " 직책은 관리자 승인 후 로그인할 수 있습니다."
                : "가입이 완료되었습니다. 로그인해 주세요.";
        return new SignupResponse(message, UserResponse.from(user));
    }

    @Transactional(readOnly = true)
    public User getByLoginId(String loginId) {
        return userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다."));
    }

    // ---------- 관리자 기능 ----------

    @Transactional(readOnly = true)
    public List<UserResponse> findByStatus(UserStatus status) {
        return userRepository.findAllByStatusOrderByCreatedAtAsc(status).stream()
                .map(UserResponse::from)
                .toList();
    }

    @Transactional
    public UserResponse approve(Long userId) {
        User user = findPending(userId);
        user.approve();
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse reject(Long userId) {
        User user = findPending(userId);
        user.reject();
        return UserResponse.from(user);
    }

    private User findPending(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "사용자가 없습니다."));
        if (user.getStatus() != UserStatus.PENDING) {
            throw new ApiException(HttpStatus.CONFLICT, "승인 대기 상태가 아닙니다.");
        }
        return user;
    }
}
