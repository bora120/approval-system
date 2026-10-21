package com.example.approval.messenger.service;

import com.example.approval.domain.User;
import com.example.approval.exception.ApiException;
import com.example.approval.messenger.MessengerLimits;
import com.example.approval.messenger.domain.MessengerKey;
import com.example.approval.messenger.dto.KeyRegisterRequest;
import com.example.approval.messenger.dto.KeyResponse;
import com.example.approval.messenger.repository.MessengerKeyRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;

/** 메신저 공개키 등록·조회 */
@Service
public class MessengerKeyService {

    private final MessengerKeyRepository keyRepository;

    public MessengerKeyService(MessengerKeyRepository keyRepository) {
        this.keyRepository = keyRepository;
    }

    @Transactional(readOnly = true)
    public Optional<MessengerKey> activeKeyOf(User user) {
        return keyRepository.findFirstByUserAndActiveTrueOrderByIdDesc(user);
    }

    /** 새 공개키 등록. 기존 키는 비활성화(삭제하지 않음 → 예전 메시지 서명 검증용) */
    @Transactional
    public KeyResponse register(User user, KeyRegisterRequest req) {
        String enc = validatePublicJwk(req == null ? null : req.encPublicKey(), "암호화용");
        String sig = validatePublicJwk(req == null ? null : req.sigPublicKey(), "서명용");
        if (enc.equals(sig)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "암호화용 키와 서명용 키는 서로 달라야 합니다.");
        }

        keyRepository.findByUserAndActiveTrue(user).forEach(MessengerKey::deactivate);
        MessengerKey saved = keyRepository.save(new MessengerKey(user, enc, sig, fingerprint(enc, sig)));
        return KeyResponse.from(saved);
    }

    /**
     * 안전번호(지문): 두 공개키를 이어 붙여 SHA-256.
     * 브라우저도 같은 방식으로 계산해 서버가 키를 바꿔치기하지 않았는지 확인한다.
     */
    public static String fingerprint(String encPublicKey, String sigPublicKey) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest((encPublicKey + "\n" + sigPublicKey).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().withUpperCase().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 공개키(JWK) 형식 검사.
     * 실수로 개인키("d" 값 포함)를 보내면 거부한다 → 개인키가 서버에 저장되는 사고 방지.
     */
    private static String validatePublicJwk(String jwk, String label) {
        if (jwk == null || jwk.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, label + " 공개키가 필요합니다.");
        }
        String k = jwk.strip();
        if (k.length() > MessengerLimits.MAX_PUBLIC_KEY_LENGTH || !k.startsWith("{") || !k.endsWith("}")
                || !k.contains("\"kty\":\"RSA\"") || !k.contains("\"n\":") || !k.contains("\"e\":")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, label + " 공개키 형식이 올바르지 않습니다.");
        }
        if (k.contains("\"d\":") || k.contains("\"p\":") || k.contains("\"q\":")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "개인키는 서버로 보낼 수 없습니다.");
        }
        return k;
    }
}
