package com.example.approval.pki.crypto;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;

/**
 * 전자서명에 쓰는 암호 도구 모음 (JDK 표준 API 만 사용).
 *
 *  - 키 알고리즘 : ECDSA P-256 (secp256r1) — 브라우저 Web Crypto 와 JDK 모두 기본 지원
 *  - 서명 형식   : 브라우저는 r||s(64바이트, IEEE P1363) 형식으로 서명을 만든다
 *                 → JDK 의 "SHA256withECDSAinP1363Format" 으로 그대로 검증
 *  - CA 개인키 보관 : PBKDF2(비밀번호) 로 만든 AES-256-GCM 키로 암호화해서 DB 에 저장
 */
public final class PkiCrypto {

    private PkiCrypto() {}

    public static final String CURVE = "secp256r1";
    public static final String BROWSER_SIGNATURE_ALGORITHM = "SHA256withECDSAinP1363Format";
    public static final int PBKDF2_ITERATIONS = 310_000;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getEncoder();
    private static final Base64.Decoder B64D = Base64.getDecoder();

    // ------------------------------------------------------------------ 키

    public static KeyPair generateKeyPair() throws GeneralSecurityException {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new ECGenParameterSpec(CURVE), RANDOM);
        return g.generateKeyPair();
    }

    /** 브라우저가 보낸 공개키(SPKI DER 의 Base64) → PublicKey. P-256 이 아니면 거부 */
    public static ECPublicKey parsePublicKey(String spkiBase64) throws GeneralSecurityException {
        byte[] der;
        try {
            der = B64D.decode(spkiBase64);
        } catch (IllegalArgumentException e) {
            throw new GeneralSecurityException("공개키 Base64 형식 오류");
        }
        if (der.length > 200) throw new GeneralSecurityException("공개키가 너무 깁니다.");
        PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(der));
        if (!(key instanceof ECPublicKey ec) || !isP256(ec)) {
            throw new GeneralSecurityException("P-256 ECDSA 공개키만 사용할 수 있습니다.");
        }
        return ec;
    }

    public static boolean isP256(ECPublicKey key) {
        try {
            AlgorithmParameters p = AlgorithmParameters.getInstance("EC");
            p.init(new ECGenParameterSpec(CURVE));
            ECParameterSpec expected = p.getParameterSpec(ECParameterSpec.class);
            ECParameterSpec actual = key.getParams();
            return actual.getCurve().equals(expected.getCurve())
                    && actual.getGenerator().equals(expected.getGenerator())
                    && actual.getOrder().equals(expected.getOrder());
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ 서명 검증

    /** 브라우저(Web Crypto ECDSA)가 만든 r||s 서명 검증 */
    public static boolean verifyBrowserSignature(PublicKey key, String message, String signatureBase64) {
        try {
            byte[] sig = B64D.decode(signatureBase64);
            if (sig.length != 64) return false; // P-256 r||s = 32 + 32 바이트
            Signature v = Signature.getInstance(BROWSER_SIGNATURE_ALGORITHM);
            v.initVerify(key);
            v.update(message.getBytes(StandardCharsets.UTF_8));
            return v.verify(sig);
        } catch (IllegalArgumentException | GeneralSecurityException e) {
            return false;
        }
    }

    /** cert 가 ca 의 개인키로 서명된(= ca 가 발급한) 인증서인지 */
    public static boolean isIssuedBy(X509Certificate cert, X509Certificate ca) {
        if (!cert.getIssuerX500Principal().equals(ca.getSubjectX500Principal())) return false;
        try {
            cert.verify(ca.getPublicKey());
            return true;
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    // ------------------------------------------------------------------ PEM

    public static String toPem(X509Certificate cert) {
        try {
            String b64 = Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII))
                    .encodeToString(cert.getEncoded());
            return "-----BEGIN CERTIFICATE-----\n" + b64 + "\n-----END CERTIFICATE-----\n";
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static X509Certificate fromPem(String pem) {
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            return (X509Certificate) cf.generateCertificate(
                    new ByteArrayInputStream(pem.getBytes(StandardCharsets.US_ASCII)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("저장된 인증서를 읽을 수 없습니다.", e);
        }
    }

    // ------------------------------------------------------------------ CA 개인키 암호화

    public record EncryptedKey(String ciphertext, String salt, String iv, int iterations) {}

    private static final byte[] KEY_AAD = "E-APPROVAL-CA-KEY v1".getBytes(StandardCharsets.US_ASCII);

    public static EncryptedKey encryptPrivateKey(PrivateKey key, char[] password) throws GeneralSecurityException {
        byte[] salt = randomBytes(16);
        byte[] iv = randomBytes(12);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, deriveKey(password, salt, PBKDF2_ITERATIONS), new GCMParameterSpec(128, iv));
        c.updateAAD(KEY_AAD);
        byte[] ct = c.doFinal(key.getEncoded()); // PKCS#8
        return new EncryptedKey(B64.encodeToString(ct), B64.encodeToString(salt), B64.encodeToString(iv),
                PBKDF2_ITERATIONS);
    }

    /** 비밀번호가 틀리면 GCM 태그 검증이 실패해서 예외 발생 */
    public static PrivateKey decryptPrivateKey(EncryptedKey enc, char[] password) throws GeneralSecurityException {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, deriveKey(password, B64D.decode(enc.salt()), enc.iterations()),
                new GCMParameterSpec(128, B64D.decode(enc.iv())));
        c.updateAAD(KEY_AAD);
        byte[] pkcs8 = c.doFinal(B64D.decode(enc.ciphertext()));
        return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
    }

    private static SecretKey deriveKey(char[] password, byte[] salt, int iterations) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, 256);
        try {
            byte[] k = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return new SecretKeySpec(k, "AES");
        } finally {
            spec.clearPassword();
        }
    }

    // ------------------------------------------------------------------ 기타

    public static String sha256Hex(String text) {
        return sha256Hex(text.getBytes(StandardCharsets.UTF_8));
    }

    public static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 일련번호를 대문자 16진수로 (화면 표시·조회 키) */
    public static String serialHex(BigInteger serial) {
        return serial.toString(16).toUpperCase();
    }

    public static byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return b;
    }
}
