package com.example.approval.organization.service;

import com.example.approval.domain.Position;
import com.example.approval.domain.Role;
import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.dto.UserResponse;
import com.example.approval.exception.ApiException;
import com.example.approval.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/**
 * 조직 관리: 직원 목록, 직책 변경, 관리자 권한 부여/회수.
 *
 * 권한 규칙
 *  - 관리자(ADMIN)·대표(SUPER_ADMIN): 직원 목록 조회, 사원~본부장 직책 변경
 *  - 대표만: 부대표 지정/해제, 관리자 권한 부여/회수
 *  - 아무도: 대표 계정 변경, 대표 직책 부여, 자기 자신의 직책·권한 변경
 */
@Service
public class OrganizationService {

    private final UserRepository userRepository;

    public OrganizationService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** 전체 직원: 승인 대기 → 직책 높은 순 → 이름 순 */
    @Transactional(readOnly = true)
    public List<UserResponse> allUsers() {
        return userRepository.findAllByOrderByCreatedAtAsc().stream()
                .sorted(Comparator
                        .comparing((User u) -> u.getStatus() != UserStatus.PENDING)
                        .thenComparing((User u) -> u.getPosition() == null ? 1 : -u.getPosition().ordinal())
                        .thenComparing(User::getName))
                .map(UserResponse::from)
                .toList();
    }

    @Transactional
    public UserResponse changePosition(String actorLoginId, Long targetId, Position position) {
        User actor = currentManager(actorLoginId);
        User target = findUser(targetId);
        boolean actorIsCeo = actor.getRole() == Role.SUPER_ADMIN;

        if (position == null) throw badRequest("직책을 선택하세요.");
        if (target.getId().equals(actor.getId())) throw forbidden("자기 자신의 직책은 바꿀 수 없습니다.");
        if (target.getRole() == Role.SUPER_ADMIN) throw forbidden("대표 계정의 직책은 바꿀 수 없습니다.");
        if (!target.isEmployee()) throw forbidden("시스템 관리자 계정에는 직책을 지정할 수 없습니다.");
        if (position == Position.CEO) throw forbidden("대표 직책은 지정할 수 없습니다. 대표는 최초 설정에서 한 명만 만들어집니다.");
        if ((position == Position.VICE_CEO || target.getPosition() == Position.VICE_CEO) && !actorIsCeo) {
            throw forbidden("부대표 지정·해제는 대표만 할 수 있습니다.");
        }

        target.changePosition(position);
        return UserResponse.from(target);
    }

    @Transactional
    public UserResponse changeRole(String actorLoginId, Long targetId, Role role) {
        User actor = currentManager(actorLoginId);
        User target = findUser(targetId);

        if (actor.getRole() != Role.SUPER_ADMIN) throw forbidden("관리자 권한은 대표만 부여하거나 회수할 수 있습니다.");
        if (role == null || role == Role.SUPER_ADMIN) throw badRequest("일반 사용자 또는 관리자만 선택할 수 있습니다.");
        if (target.getId().equals(actor.getId()) || target.getRole() == Role.SUPER_ADMIN) {
            throw forbidden("대표 계정의 권한은 바꿀 수 없습니다.");
        }
        if (target.getStatus() != UserStatus.ACTIVE) throw conflict("가입이 승인된 사용자만 권한을 바꿀 수 있습니다.");

        target.changeRole(role);
        return UserResponse.from(target);
    }

    private User currentManager(String loginId) {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        if (!user.getRole().canManageUsers() || user.getStatus() != UserStatus.ACTIVE) {
            throw forbidden("관리자만 사용할 수 있습니다.");
        }
        return user;
    }

    private User findUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));
    }

    private static ApiException badRequest(String m) { return new ApiException(HttpStatus.BAD_REQUEST, m); }
    private static ApiException forbidden(String m) { return new ApiException(HttpStatus.FORBIDDEN, m); }
    private static ApiException conflict(String m) { return new ApiException(HttpStatus.CONFLICT, m); }
}
