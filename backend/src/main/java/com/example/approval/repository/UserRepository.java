package com.example.approval.repository;

import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByLoginId(String loginId);
    boolean existsByLoginId(String loginId);
    List<User> findAllByStatusOrderByCreatedAtAsc(UserStatus status);
}
