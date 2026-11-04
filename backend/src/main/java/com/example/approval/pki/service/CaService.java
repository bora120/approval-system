package com.example.approval.pki.service;

import com.example.approval.domain.User;
import com.example.approval.exception.ApiException;
import com.example.approval.pki.crypto.CertificateBuilder;
import com.example.approval.pki.crypto.CertificateBuilder.NamePart;
import com.example.approval.pki.crypto.PkiCrypto;
import com.example.approval.pki.domain.CertificateAuthority;
import com.example.approval.pki.repository.CertificateAuthorityRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 사내 인증기관(CA).
 *
 * 서버가 켜질 때 DB 에서 루트 인증서를 불러온다. 없으면 새로 만들어 저장한다.
 * CA 개인키는 CA_KEY_PASSWORD 로 암호화되어 DB 에 있고, 복호화한 키는 서버 메모리에만 둔다.
 * → 팀원 모두 .env 에 "같은" CA_KEY_PASSWORD 를 넣어야 같은 CA 를 쓸 수 있다.
 */
@Service
public class CaService {

    private static final Logger log = LoggerFactory.getLogger(CaService.class);

    public static final String ORGANIZATION = "E-Approval";
    private static final Duration CA_VALIDITY = Duration.ofDays(3650);   // 루트 인증서 10년
    private static final Duration USER_VALIDITY = Duration.ofDays(365);  // 사용자 인증서 1년

    private record Loaded(X509Certificate certificate, PrivateKey privateKey) {}

    private final CertificateAuthorityRepository repository;
    private final String password;
    private volatile Loaded loaded;

    public CaService(CertificateAuthorityRepository repository,
                     @Value("${app.pki.ca-password:}") String password) {
        this.repository = repository;
        this.password = password == null ? "" : password;
    }

    /** 서버 시작 시 미리 준비 (실패해도 서버는 켜지고, 인증서 기능을 쓸 때 안내 메시지를 보여줌) */
    @EventListener(ApplicationReadyEvent.class)
    public void initOnStartup() {
        try {
            X509Certificate ca = load().certificate();
            log.info("사내 인증기관(CA) 준비 완료: {} (일련번호 {})",
                    ca.getSubjectX500Principal().getName(), PkiCrypto.serialHex(ca.getSerialNumber()));
        } catch (ApiException e) {
            log.warn("전자서명 기능을 쓸 수 없습니다: {}", e.getMessage());
        } catch (RuntimeException e) {
            log.warn("사내 인증기관(CA) 준비 중 오류", e);
        }
    }

    public X509Certificate certificate() {
        return load().certificate();
    }

    /** 사용자 공개키에 대한 인증서 발급 (CA 개인키로 서명) */
    public X509Certificate issue(User user, PublicKey userPublicKey) {
        Loaded ca = load();
        List<NamePart> subject = new ArrayList<>();
        subject.add(NamePart.country("KR"));
        subject.add(NamePart.organization(ORGANIZATION));
        subject.add(NamePart.unit(user.getDepartment()));
        subject.add(NamePart.commonName(user.getName()));
        subject.add(NamePart.userId(user.getLoginId()));

        Instant now = Instant.now();
        try {
            return CertificateBuilder.build(new CertificateBuilder.Spec(
                    CertificateBuilder.randomSerial(),
                    CertificateBuilder.name(subject),
                    userPublicKey,
                    ca.certificate().getSubjectX500Principal().getEncoded(),
                    ca.certificate().getPublicKey(),
                    ca.privateKey(),
                    Date.from(now.minusSeconds(60)), // 시계 오차 여유
                    Date.from(now.plus(USER_VALIDITY)),
                    false));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("인증서 발급 실패", e);
        }
    }

    // ------------------------------------------------------------------ 로드 / 생성

    private Loaded load() {
        Loaded l = loaded;
        if (l != null) return l;
        synchronized (this) {
            if (loaded == null) loaded = loadOrCreate();
            return loaded;
        }
    }

    private Loaded loadOrCreate() {
        if (password.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "서버에 CA_KEY_PASSWORD 가 설정되지 않았습니다. backend/.env 를 확인하세요.");
        }
        if (password.startsWith("CHANGE_ME")) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "backend/.env 의 CA_KEY_PASSWORD 를 예시값이 아닌 팀 공용 비밀번호로 바꾸세요.");
        }
        if (password.length() < 12) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "CA_KEY_PASSWORD 는 12자 이상이어야 합니다. backend/.env 를 확인하세요.");
        }
        CertificateAuthority row = repository.findByName(CertificateAuthority.ROOT).orElse(null);
        if (row == null) {
            try {
                row = repository.saveAndFlush(createRoot());
                log.info("사내 인증기관(CA) 루트 인증서를 새로 만들었습니다.");
            } catch (DataIntegrityViolationException e) {
                // 다른 팀원 서버가 같은 순간에 먼저 만든 경우 → 그걸 사용
                row = repository.findByName(CertificateAuthority.ROOT).orElseThrow(() -> e);
            }
        }
        return decrypt(row);
    }

    private CertificateAuthority createRoot() {
        try {
            KeyPair kp = PkiCrypto.generateKeyPair();
            byte[] name = CertificateBuilder.name(List.of(
                    NamePart.country("KR"),
                    NamePart.organization(ORGANIZATION),
                    NamePart.commonName(ORGANIZATION + " Root CA")));
            Instant now = Instant.now();
            X509Certificate cert = CertificateBuilder.build(new CertificateBuilder.Spec(
                    CertificateBuilder.randomSerial(), name, kp.getPublic(),
                    name, kp.getPublic(), kp.getPrivate(),               // 자기 자신이 서명 (자체 서명 루트)
                    Date.from(now.minusSeconds(60)), Date.from(now.plus(CA_VALIDITY)), true));
            PkiCrypto.EncryptedKey enc = PkiCrypto.encryptPrivateKey(kp.getPrivate(), password.toCharArray());
            return new CertificateAuthority(PkiCrypto.toPem(cert), enc.ciphertext(), enc.salt(), enc.iv(),
                    enc.iterations());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("CA 생성 실패", e);
        }
    }

    private Loaded decrypt(CertificateAuthority row) {
        X509Certificate cert = PkiCrypto.fromPem(row.getCertificatePem());
        PrivateKey key;
        try {
            key = PkiCrypto.decryptPrivateKey(new PkiCrypto.EncryptedKey(
                    row.getEncryptedPrivateKey(), row.getKeySalt(), row.getKeyIv(), row.getKdfIterations()),
                    password.toCharArray());
        } catch (GeneralSecurityException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                    "CA_KEY_PASSWORD 가 처음 CA 를 만들 때 쓴 값과 다릅니다. 팀원과 같은 값인지 확인하세요.");
        }
        return new Loaded(cert, key);
    }
}
