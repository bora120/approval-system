package com.example.approval.messenger.repository;

import com.example.approval.domain.User;
import com.example.approval.messenger.domain.MessengerKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MessengerKeyRepository extends JpaRepository<MessengerKey, Long> {

    Optional<MessengerKey> findFirstByUserAndActiveTrueOrderByIdDesc(User user);

    List<MessengerKey> findByUserAndActiveTrue(User user);

    List<MessengerKey> findByUserInAndActiveTrue(Collection<User> users);

    List<MessengerKey> findByIdIn(Collection<Long> ids);
}
