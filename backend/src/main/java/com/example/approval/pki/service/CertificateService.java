package com.example.approval.pki.service;

import com.example.approval.domain.User;
import com.example.approval.domain.UserStatus;
import com.example.approval.exception.ApiException;
import com.example.approval.pki.crypto.PkiCrypto;
import com.example.approval.pki.domain.CertificateStatus;
import com.example.approval.pki.domain.UserCertificate;
import com.example.approval.pki.dto.CertificateIssueRequest;
import com.example.approval.pki.dto.CertificateResponse;
import com.example.approval.pki.dto.ChallengeResponse;
import com.example.approval.pki.dto.MyCertificateResponse;
import com.example.approval.pki.repository.UserCertificateRepository;
import com.example.approval.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.security.auth.x500.X500Principal;
import java.security.GeneralSecurityException;
import java.security.PublicKey;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Base64;

/**
 * 사용자 인증서 발급·조회.
 *
 * 발급 절차 (실제 공동인증서 발급과 같은 흐름을 단순화)
 *   1) 브라우저: 서버에서 1회용 challenge 를 받는다.
 *   2) 브라우저: ECDSA P-256 키쌍 생성 → 개인키는 "인증서 암호"로 암호화해 브라우저에만 저장
 *   3) 브라우저: 발급 요청문(아이디 + challenge + 공개키)에 새 개인키로 서명 → 개인키 소유 증명(PoP)
 *   4) 서버: 로그인 비밀번호로 본인 확인 + challenge 확인 + PoP 서명 검증
 *   5) 서버(CA): 공개키에 X.509 인증서를 발급(CA 개인키로 서명), 이전 인증서는 폐기
 */
@Service
public class CertificateService {

    private static final String CHALLENGE_ATTR = "pki.challenge";
    private static final long CHALLENGE_TTL_SECONDS = 300;

    private final UserCertificateRepository certificateRepository;
    private final UserRepository userRepository;
    private final CaService caService;
    private final PasswordEncoder passwordEncoder;

    public CertificateService(UserCertificateRepository certificateRepository, UserRepository userRepository,
                              CaService caService, PasswordEncoder passwordEncoder) {
        this.certificateRepository = certificateRepository;
        this.userRepository = userRepository;
        this.caService = caService;
        this.passwordEncoder = passwordEncoder;
    }

    /** 발급 요청문. 브라우저(features/pki/crypto.ts)와 글자 하나까지 같아야 한다 */
    public static String requestMessage(String loginId, String challenge, String publicKey) {
        return "E-APPROVAL-CERT-REQUEST v1\n"
                + "login-id: " + loginId + "\n"
                + "challenge: " + challenge + "\n"
                + "public-key: " + publicKey;
    }

    private record Challenge(String value, Instant expiresAt) implements java.io.Serializable {}

    public ChallengeResponse newChallenge(String loginId, HttpSession session) {
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(PkiCrypto.randomBytes(32));
        session.setAttribute(CHALLENGE_ATTR, new Challenge(value, Instant.now().plusSeconds(CHALLENGE_TTL_SECONDS)));
        return new ChallengeResponse(value, loginId);
    }

    @Transactional
    public CertificateResponse issue(String loginId, CertificateIssueRequest req, HttpSession session) {
        User user = currentUser(loginId);
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(HttpStatus.FORBIDDEN, "승인된 계정만 인증서를 발급받을 수 있습니다.");
        }
        if (req == null || isBlank(req.publicKey()) || isBlank(req.proof()) || isBlank(req.loginPassword())) {
            throw badRequest("발급 요청 정보가 부족합니다.");
        }

        // 1) 본인 확인
        if (!passwordEncoder.matches(req.loginPassword(), user.getPassword())) {
            throw badRequest("로그인 비밀번호가 올바르지 않습니다.");
        }

        // 2) challenge: 한 번 쓰면 바로 삭제 (재사용 불가)
        Object saved = session.getAttribute(CHALLENGE_ATTR);
        session.removeAttribute(CHALLENGE_ATTR);
        if (!(saved instanceof Challenge challenge) || Instant.now().isAfter(challenge.expiresAt())) {
            throw badRequest("발급 요청 시간이 지났습니다. 다시 시도하세요.");
        }

        // 3) 공개키 형식 + 개인키 소유 증명
        PublicKey publicKey;
        try {
            publicKey = PkiCrypto.parsePublicKey(req.publicKey());
        } catch (GeneralSecurityException e) {
            throw badRequest("공개키 형식이 올바르지 않습니다. (" + e.getMessage() + ")");
        }
        String message = requestMessage(user.getLoginId(), challenge.value(), req.publicKey());
        if (!PkiCrypto.verifyBrowserSignature(publicKey, message, req.proof())) {
            throw badRequest("개인키 소유 증명(서명) 검증에 실패했습니다.");
        }

        // 4) 기존 인증서 폐기 → 새 인증서 발급
        certificateRepository.findByUserAndStatus(user, CertificateStatus.VALID).forEach(UserCertificate::revoke);
        X509Certificate cert = caService.issue(user, publicKey);
        UserCertificate entity = certificateRepository.save(new UserCertificate(
                user,
                PkiCrypto.serialHex(cert.getSerialNumber()),
                cert.getSubjectX500Principal().getName(X500Principal.RFC2253),
                PkiCrypto.toPem(cert),
                toLocal(cert.getNotBefore().toInstant()),
                toLocal(cert.getNotAfter().toInstant())));
        return CertificateResponse.from(entity);
    }

    /** 지금 쓸 수 있는 내 인증서 */
    @Transactional(readOnly = true)
    public MyCertificateResponse myCertificate(String loginId) {
        User user = currentUser(loginId);
        return new MyCertificateResponse(certificateRepository
                .findFirstByUserAndStatusOrderByIdDesc(user, CertificateStatus.VALID)
                .filter(UserCertificate::isUsableNow)
                .map(CertificateResponse::from)
                .orElse(null));
    }

    @Transactional(readOnly = true)
    public UserCertificate findBySerial(String serial) {
        return certificateRepository.findBySerialNumber(serial == null ? "" : serial.toUpperCase())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "인증서를 찾을 수 없습니다."));
    }

    public String caCertificatePem() {
        return PkiCrypto.toPem(caService.certificate());
    }

    public X509Certificate caCertificate() {
        return caService.certificate();
    }

    // ------------------------------------------------------------------ 유틸

    private User currentUser(String loginId) {
        return userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    private static LocalDateTime toLocal(Instant i) {
        return LocalDateTime.ofInstant(i, ZoneId.systemDefault());
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }

    private static ApiException badRequest(String m) { return new ApiException(HttpStatus.BAD_REQUEST, m); }
}
