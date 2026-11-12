package com.example.approval.pki.repository;

import com.example.approval.domain.User;
import com.example.approval.pki.domain.CertificateStatus;
import com.example.approval.pki.domain.UserCertificate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserCertificateRepository extends JpaRepository<UserCertificate, Long> {

    Optional<UserCertificate> findBySerialNumber(String serialNumber);

    List<UserCertificate> findByUserAndStatus(User user, CertificateStatus status);

    Optional<UserCertificate> findFirstByUserAndStatusOrderByIdDesc(User user, CertificateStatus status);

    /** 로그인 ID로 조회하는 공개 인증서. 개인키 백업 컬럼은 응답 DTO에 포함하지 않는다. */
    Optional<UserCertificate> findFirstByUser_LoginIdAndStatusOrderByIdDesc(
            String loginId, CertificateStatus status);
}
