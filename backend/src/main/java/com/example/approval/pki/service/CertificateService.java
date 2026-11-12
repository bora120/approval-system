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
import com.example.approval.pki.dto.PrivateKeyBackupRequest;
import com.example.approval.pki.dto.PrivateKeyBackupResponse;
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
import java.util.Arrays;
import java.util.Base64;

/**
 * 사용자 인증서 발급·조회.
 *
 * 발급 절차 (실제 공동인증서 발급과 같은 흐름을 단순화)
 *   1) 브라우저: 서버에서 1회용 challenge 를 받는다.
 *   2) 브라우저: ECDSA P-256 키쌍 생성 → 개인키는 "인증서 암호"로 암호화 (암호문은 브라우저 + 서버 DB 에 보관)
 *   3) 브라우저: 발급 요청문(아이디 + challenge + 공개키)에 새 개인키로 서명 → 개인키 소유 증명(PoP)
 *   4) 서버: 로그인 비밀번호로 본인 확인 + challenge 확인 + PoP 서명 검증
 *   5) 서버(CA): 공개키에 X.509 인증서를 발급(CA 개인키로 서명), 이전 인증서는 폐기
 *
 * 개인키 보관: 인증서(공개키)는 공개, 개인키는 암호문으로만 DB 에 보관한다.
 *   서버는 인증서 암호를 모르므로 암호문을 풀 수 없고, 본인만 자기 암호문을 내려받을 수 있다.
 */
@Service
public class CertificateService {

    private static final String CHALLENGE_ATTR = "pki.challenge";
    private static final long CHALLENGE_TTL_SECONDS = 300;
    private static final int MIN_PBKDF2_ITERATIONS = 600_000;   // 브라우저(features/pki/crypto.ts)와 같은 값
    private static final int MAX_PBKDF2_ITERATIONS = 2_000_000;
    private static final int MAX_CIPHERTEXT_BYTES = 8_192;

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
        validateEncryptedBackup(req.encryptedPrivateKey(), req.privateKeySalt(), req.privateKeyIv(),
                req.privateKeyIterations());

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
            throw badRequest("공개키 형식이 올바르지 않습니다.");
        }
        String message = requestMessage(user.getLoginId(), challenge.value(), req.publicKey());
        if (!PkiCrypto.verifyBrowserSignature(publicKey, message, req.proof())) {
            throw badRequest("개인키 소유 증명(서명) 검증에 실패했습니다.");
        }

        // 4) 기존 인증서 폐기 → 새 인증서 발급 + 암호화된 개인키 보관
        certificateRepository.findByUserAndStatus(user, CertificateStatus.VALID).forEach(UserCertificate::revoke);
        X509Certificate cert = caService.issue(user, publicKey);
        UserCertificate entity = new UserCertificate(
                user,
                PkiCrypto.serialHex(cert.getSerialNumber()),
                cert.getSubjectX500Principal().getName(X500Principal.RFC2253),
                PkiCrypto.toPem(cert),
                toLocal(cert.getNotBefore().toInstant()),
                toLocal(cert.getNotAfter().toInstant()));
        entity.saveEncryptedPrivateKey(req.publicKey(), req.encryptedPrivateKey(), req.privateKeySalt(),
                req.privateKeyIv(), req.privateKeyIterations());
        certificateRepository.save(entity);
        return CertificateResponse.from(entity);
    }

    /** 지금 쓸 수 있는 내 인증서 (+ 서버에 암호화 개인키가 보관돼 있는지) */
    @Transactional(readOnly = true)
    public MyCertificateResponse myCertificate(String loginId) {
        User user = currentUser(loginId);
        return usableCertificate(user)
                .map(c -> new MyCertificateResponse(CertificateResponse.from(c), c.hasEncryptedPrivateKey()))
                .orElse(new MyCertificateResponse(null, false));
    }

    /**
     * 다른 사용자의 공개 인증서 (인증서는 공개 문서).
     * 문서를 보낼 때·서명을 검증할 때 상대 인증서를 확인하는 용도. 암호화 개인키는 절대 포함하지 않는다.
     */
    @Transactional(readOnly = true)
    public CertificateResponse publicCertificate(String loginId) {
        return certificateRepository
                .findFirstByUser_LoginIdAndStatusOrderByIdDesc(loginId, CertificateStatus.VALID)
                .filter(UserCertificate::isUsableNow)
                .map(CertificateResponse::from)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "사용자의 유효한 공개 인증서가 없습니다."));
    }

    /**
     * 암호화 개인키 보관(갱신) — 이 기능 이전에 발급받아 브라우저에만 키가 있는 사용자용.
     * 공개키가 현재 인증서의 공개키와 같은지 확인해서, 다른 키를 올리는 것을 막는다.
     */
    @Transactional
    public PrivateKeyBackupResponse savePrivateKeyBackup(String loginId, PrivateKeyBackupRequest req) {
        if (req == null) throw badRequest("개인키 백업 정보가 없습니다.");
        validateEncryptedBackup(req.wrappedKey(), req.salt(), req.iv(), req.iterations());
        if (isBlank(req.serialNumber()) || isBlank(req.publicKey())) {
            throw badRequest("인증서 일련번호와 공개키가 필요합니다.");
        }
        UserCertificate certificate = usableCertificate(currentUser(loginId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "유효한 인증서가 없습니다."));
        if (!certificate.getSerialNumber().equalsIgnoreCase(req.serialNumber())) {
            throw new ApiException(HttpStatus.CONFLICT, "현재 인증서와 백업 대상 인증서가 일치하지 않습니다.");
        }
        verifyPublicKeyMatchesCertificate(req.publicKey(), certificate);
        certificate.saveEncryptedPrivateKey(req.publicKey(), req.wrappedKey(), req.salt(), req.iv(), req.iterations());
        return PrivateKeyBackupResponse.from(certificate);
    }

    /** 본인의 암호화 개인키만 내려준다 (다른 사람·관리자는 조회 불가). 복호화는 브라우저에서 인증서 암호로 */
    @Transactional(readOnly = true)
    public PrivateKeyBackupResponse myPrivateKeyBackup(String loginId) {
        UserCertificate certificate = usableCertificate(currentUser(loginId))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "유효한 인증서가 없습니다."));
        if (!certificate.hasEncryptedPrivateKey()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "서버에 보관된 개인키가 없습니다. 인증서를 발급받은 브라우저에서 백업하세요.");
        }
        return PrivateKeyBackupResponse.from(certificate);
    }

    private java.util.Optional<UserCertificate> usableCertificate(User user) {
        return certificateRepository.findFirstByUserAndStatusOrderByIdDesc(user, CertificateStatus.VALID)
                .filter(UserCertificate::isUsableNow);
    }

    private static void verifyPublicKeyMatchesCertificate(String publicKeyBase64, UserCertificate certificate) {
        try {
            PublicKey submitted = PkiCrypto.parsePublicKey(publicKeyBase64);
            PublicKey certified = PkiCrypto.fromPem(certificate.getCertificatePem()).getPublicKey();
            if (!Arrays.equals(submitted.getEncoded(), certified.getEncoded())) {
                throw badRequest("백업 공개키가 현재 인증서의 공개키와 일치하지 않습니다.");
            }
        } catch (GeneralSecurityException e) {
            throw badRequest("공개키 형식이 올바르지 않습니다.");
        }
    }

    /** 암호문 형식 검사: Base64, salt 16바이트, IV 12바이트, 반복 횟수 범위 (브라우저 기본 60만 회) */
    private static void validateEncryptedBackup(String encrypted, String salt, String iv, Integer iterations) {
        if (isBlank(encrypted) || encrypted.length() > 12_000 || isBlank(salt) || isBlank(iv)) {
            throw badRequest("암호화된 개인키 정보가 올바르지 않습니다.");
        }
        if (iterations == null || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
            throw badRequest("개인키 암호화 반복 횟수가 허용 범위를 벗어났습니다.");
        }
        try {
            byte[] ciphertext = Base64.getDecoder().decode(encrypted);
            byte[] saltBytes = Base64.getDecoder().decode(salt);
            byte[] ivBytes = Base64.getDecoder().decode(iv);
            if (ciphertext.length < 32 || ciphertext.length > MAX_CIPHERTEXT_BYTES
                    || saltBytes.length != 16 || ivBytes.length != 12) {
                throw badRequest("개인키 암호문 길이가 올바르지 않습니다.");
            }
        } catch (IllegalArgumentException e) {
            throw badRequest("개인키 값은 Base64 형식이어야 합니다.");
        }
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
