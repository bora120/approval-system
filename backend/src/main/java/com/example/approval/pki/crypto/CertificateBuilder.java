package com.example.approval.pki.crypto;

import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

/**
 * X.509 v3 인증서 생성기 (RFC 5280).
 *
 * 인증서 구조
 *   Certificate ::= SEQUENCE {
 *       tbsCertificate       (서명 대상: 버전, 일련번호, 발급자, 유효기간, 주체, 공개키, 확장)
 *       signatureAlgorithm   (ecdsa-with-SHA256)
 *       signatureValue       (발급자 = 인증기관(CA)의 개인키로 tbsCertificate 에 서명한 값)
 *   }
 * → 누구든 CA 공개키로 서명을 검증하면 "이 공개키의 주인이 이 사람"이라는 사실을 믿을 수 있다.
 */
public final class CertificateBuilder {

    private CertificateBuilder() {}

    // ---- OID ----
    private static final String OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";
    private static final String OID_C = "2.5.4.6";
    private static final String OID_O = "2.5.4.10";
    private static final String OID_OU = "2.5.4.11";
    private static final String OID_CN = "2.5.4.3";
    private static final String OID_UID = "0.9.2342.19200300.100.1.1";
    private static final String OID_SUBJECT_KEY_ID = "2.5.29.14";
    private static final String OID_KEY_USAGE = "2.5.29.15";
    private static final String OID_BASIC_CONSTRAINTS = "2.5.29.19";
    private static final String OID_AUTHORITY_KEY_ID = "2.5.29.35";

    public static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 이름(DN) 한 칸. printable=true 면 PrintableString(국가코드 등), 아니면 UTF8String(한글 가능) */
    public record NamePart(String oid, String value, boolean printable) {
        public static NamePart country(String v) { return new NamePart(OID_C, v, true); }
        public static NamePart organization(String v) { return new NamePart(OID_O, v, false); }
        public static NamePart unit(String v) { return new NamePart(OID_OU, v, false); }
        public static NamePart commonName(String v) { return new NamePart(OID_CN, v, false); }
        public static NamePart userId(String v) { return new NamePart(OID_UID, v, false); }
    }

    /** Name ::= SEQUENCE OF SET OF SEQUENCE { type OID, value } */
    public static byte[] name(List<NamePart> parts) {
        List<byte[]> rdns = new ArrayList<>();
        for (NamePart p : parts) {
            if (p.value() == null || p.value().isBlank()) continue;
            byte[] value = p.printable() ? Der.printable(p.value()) : Der.utf8(p.value());
            rdns.add(Der.set(Der.sequence(Der.oid(p.oid()), value)));
        }
        return Der.sequence(rdns.toArray(byte[][]::new));
    }

    /** 128비트 양수 난수 일련번호 (RFC 5280: 20바이트 이하 양의 정수, 예측 불가능하게) */
    public static BigInteger randomSerial() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        b[0] &= 0x7F;      // 양수
        b[0] |= 0x40;      // 맨 앞이 0이 되지 않게 → 항상 32자리 16진수
        return new BigInteger(1, b);
    }

    /** 키 식별자: SHA-256(공개키 SPKI) 앞 20바이트 (RFC 7093 방식) */
    public static byte[] keyIdentifier(PublicKey key) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(key.getEncoded());
            return Arrays.copyOf(h, 20);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public record Spec(
            BigInteger serial,
            byte[] subjectName,
            PublicKey subjectPublicKey,
            byte[] issuerName,
            PublicKey issuerPublicKey,
            PrivateKey issuerPrivateKey,
            Date notBefore,
            Date notAfter,
            boolean ca
    ) {}

    /** 인증서를 만들고 CA 개인키로 서명한 뒤, JDK 파서로 다시 읽어 X509Certificate 로 돌려준다 */
    public static X509Certificate build(Spec s) throws GeneralSecurityException {
        byte[] algId = Der.sequence(Der.oid(OID_ECDSA_SHA256)); // ECDSA 는 parameters 없음

        List<byte[]> exts = new ArrayList<>();
        if (s.ca()) {
            // CA: 다른 인증서를 발급할 수 있음 (pathLen=0 → 하위 CA 는 못 만듦)
            exts.add(extension(OID_BASIC_CONSTRAINTS, true, Der.sequence(Der.bool(true), Der.integer(0))));
            // keyCertSign(5) + cRLSign(6) → 0000 0110, 안 쓰는 비트 1개
            exts.add(extension(OID_KEY_USAGE, true, Der.bitString(new byte[]{0x06}, 1)));
        } else {
            // 일반 사용자: CA 아님 (기본값 false 는 DER 에서 생략 → 빈 SEQUENCE)
            exts.add(extension(OID_BASIC_CONSTRAINTS, true, Der.sequence()));
            // digitalSignature(0) + nonRepudiation(1) → 1100 0000, 안 쓰는 비트 6개
            exts.add(extension(OID_KEY_USAGE, true, Der.bitString(new byte[]{(byte) 0xC0}, 6)));
        }
        exts.add(extension(OID_SUBJECT_KEY_ID, false, Der.octetString(keyIdentifier(s.subjectPublicKey()))));
        exts.add(extension(OID_AUTHORITY_KEY_ID, false,
                Der.sequence(Der.implicitPrimitive(0, keyIdentifier(s.issuerPublicKey())))));

        byte[] tbs = Der.sequence(
                Der.explicit(0, Der.integer(2)),                     // 버전: v3 (값 2)
                Der.integer(s.serial()),
                algId,
                s.issuerName(),
                Der.sequence(Der.time(s.notBefore()), Der.time(s.notAfter())),
                s.subjectName(),
                s.subjectPublicKey().getEncoded(),                   // SubjectPublicKeyInfo (JDK 가 DER 로 줌)
                Der.explicit(3, Der.sequence(exts.toArray(byte[][]::new)))
        );

        Signature signer = Signature.getInstance(SIGNATURE_ALGORITHM);
        signer.initSign(s.issuerPrivateKey());
        signer.update(tbs);
        byte[] sig = signer.sign();

        byte[] der = Der.sequence(tbs, algId, Der.bitString(sig, 0));
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        return (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(der));
    }

    /** Extension ::= SEQUENCE { extnID, critical BOOLEAN DEFAULT FALSE, extnValue OCTET STRING } */
    private static byte[] extension(String oid, boolean critical, byte[] valueDer) {
        return critical
                ? Der.sequence(Der.oid(oid), Der.bool(true), Der.octetString(valueDer))
                : Der.sequence(Der.oid(oid), Der.octetString(valueDer));
    }
}
