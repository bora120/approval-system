package com.example.approval.document.service;

import com.example.approval.document.dto.ApproverResponse;
import com.example.approval.domain.Position;
import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.exception.ApiException;
import com.example.approval.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/** 결재선 만들 때 필요한 기능: 기본 결재선 추천, 결재자 검색 */
@Service
@Transactional(readOnly = true)
public class ApprovalLineService {

    private final UserRepository userRepository;

    public ApprovalLineService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * 기본 결재선 추천: 작성자보다 높은 직책을 낮은 순서대로 한 명씩.
     * 같은 부서 사람을 우선으로 고르고, 없으면 다른 부서에서 고른다.
     * 예) 개발팀 사원 → 개발팀 팀장 → 본부장 → 대표
     */
    public List<ApproverResponse> defaultLine(String loginId) {
        User writer = currentUser(loginId);
        int writerLevel = writer.getPosition() == null ? -1 : writer.getPosition().ordinal();
        List<User> candidates = activeApprovers(writer);

        List<ApproverResponse> line = new ArrayList<>();
        for (Position position : Position.values()) {
            // 부대표는 선택 결재자라 기본 결재선에는 넣지 않음 (필요하면 직접 추가)
            if (position.ordinal() <= writerLevel || position == Position.STAFF || position == Position.VICE_CEO) continue;

            candidates.stream()
                    .filter(u -> u.getPosition() == position)
                    .min(Comparator
                            .comparing((User u) -> !Objects.equals(u.getDepartment(), writer.getDepartment()))
                            .thenComparing(User::getId))
                    .ifPresent(u -> line.add(ApproverResponse.from(u)));
        }
        return line;
    }

    /** 결재자 검색: 이름 또는 부서에 keyword 가 들어간 사람 (본인 제외, 직책 높은 순) */
    public List<ApproverResponse> search(String loginId, String keyword) {
        User writer = currentUser(loginId);
        String k = keyword == null ? "" : keyword.strip().toLowerCase(Locale.ROOT);

        return activeApprovers(writer).stream()
                .filter(u -> k.isEmpty()
                        || u.getName().toLowerCase(Locale.ROOT).contains(k)
                        || (u.getDepartment() != null && u.getDepartment().toLowerCase(Locale.ROOT).contains(k)))
                .sorted(Comparator
                        .comparing((User u) -> u.getPosition() == null ? 0 : -u.getPosition().ordinal())
                        .thenComparing(User::getName))
                .limit(30)
                .map(ApproverResponse::from)
                .toList();
    }

    /** 결재자가 될 수 있는 사람: 승인된 직원(직책 있음) 중 본인 제외. 관리자로 지정된 직원·대표도 포함 */
    private List<User> activeApprovers(User writer) {
        return userRepository.findAllByStatusOrderByCreatedAtAsc(UserStatus.ACTIVE).stream()
                .filter(User::isEmployee)
                .filter(u -> !u.getId().equals(writer.getId()))
                .toList();
    }

    private User currentUser(String loginId) {
        return userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }
}
