package com.example.approval.pki.repository;

import com.example.approval.pki.domain.CertificateAuthority;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CertificateAuthorityRepository extends JpaRepository<CertificateAuthority, Long> {

    Optional<CertificateAuthority> findByName(String name);
}
