package com.example.approval.pki.crypto;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Date;

/**
 * 아주 작은 ASN.1 DER 인코더. X.509 인증서를 만드는 데 필요한 타입만 지원한다.
 *
 * DER = "Tag(1바이트) + Length + Value" 를 중첩해서 쌓는 이진 형식.
 *   예) SEQUENCE { INTEGER 2 }  →  30 03 02 01 02
 * 외부 라이브러리(BouncyCastle 등) 없이 JDK 만으로 인증서를 발급하려고 직접 구현했다.
 */
public final class Der {

    private Der() {}

    // ---- 태그 값 (ITU-T X.690) ----
    private static final int BOOLEAN = 0x01;
    private static final int INTEGER = 0x02;
    private static final int BIT_STRING = 0x03;
    private static final int OCTET_STRING = 0x04;
    private static final int OID = 0x06;
    private static final int UTF8_STRING = 0x0C;
    private static final int PRINTABLE_STRING = 0x13;
    private static final int UTC_TIME = 0x17;
    private static final int GENERALIZED_TIME = 0x18;
    private static final int SEQUENCE = 0x30;
    private static final int SET = 0x31;

    /** Tag + Length + Value 하나를 만든다 */
    public static byte[] tlv(int tag, byte[] value) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(value.length + 6);
        out.write(tag);
        int len = value.length;
        if (len < 0x80) {
            out.write(len);                       // 짧은 형식: 길이 1바이트
        } else {
            byte[] lenBytes = BigInteger.valueOf(len).toByteArray();
            int start = lenBytes[0] == 0 ? 1 : 0; // 부호용 0x00 제거
            int count = lenBytes.length - start;
            out.write(0x80 | count);              // 긴 형식: 0x80 + 길이 바이트 수
            out.write(lenBytes, start, count);
        }
        out.writeBytes(value);
        return out.toByteArray();
    }

    public static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] p : parts) out.writeBytes(p);
        return out.toByteArray();
    }

    public static byte[] sequence(byte[]... items) { return tlv(SEQUENCE, concat(items)); }

    public static byte[] set(byte[]... items) { return tlv(SET, concat(items)); }

    public static byte[] integer(BigInteger value) { return tlv(INTEGER, value.toByteArray()); }

    public static byte[] integer(long value) { return integer(BigInteger.valueOf(value)); }

    public static byte[] bool(boolean value) { return tlv(BOOLEAN, new byte[]{(byte) (value ? 0xFF : 0x00)}); }

    public static byte[] octetString(byte[] value) { return tlv(OCTET_STRING, value); }

    /** BIT STRING. 첫 바이트는 "마지막 바이트에서 안 쓰는 비트 수" */
    public static byte[] bitString(byte[] value, int unusedBits) {
        byte[] v = new byte[value.length + 1];
        v[0] = (byte) unusedBits;
        System.arraycopy(value, 0, v, 1, value.length);
        return tlv(BIT_STRING, v);
    }

    public static byte[] utf8(String s) { return tlv(UTF8_STRING, s.getBytes(StandardCharsets.UTF_8)); }

    public static byte[] printable(String s) { return tlv(PRINTABLE_STRING, s.getBytes(StandardCharsets.US_ASCII)); }

    /** [n] EXPLICIT 태그 (예: 인증서 버전 [0], 확장 [3]) */
    public static byte[] explicit(int tagNumber, byte[] inner) { return tlv(0xA0 | tagNumber, inner); }

    /** [n] IMPLICIT 기본형 태그 (예: AuthorityKeyIdentifier 의 keyIdentifier [0]) */
    public static byte[] implicitPrimitive(int tagNumber, byte[] value) { return tlv(0x80 | tagNumber, value); }

    /** 객체 식별자. 예) "2.5.4.3" = commonName */
    public static byte[] oid(String dotted) {
        String[] parts = dotted.split("\\.");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(Integer.parseInt(parts[0]) * 40 + Integer.parseInt(parts[1]));
        for (int i = 2; i < parts.length; i++) {
            long v = Long.parseLong(parts[i]);
            // base-128, 마지막 바이트를 뺀 나머지는 최상위 비트를 1로
            byte[] tmp = new byte[10];
            int n = 0;
            do {
                tmp[n++] = (byte) (v & 0x7F);
                v >>>= 7;
            } while (v > 0);
            for (int j = n - 1; j >= 0; j--) {
                out.write(j > 0 ? (tmp[j] | 0x80) : tmp[j]);
            }
        }
        return tlv(OID, out.toByteArray());
    }

    private static final DateTimeFormatter UTC_FMT = DateTimeFormatter.ofPattern("yyMMddHHmmss'Z'");
    private static final DateTimeFormatter GEN_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss'Z'");

    /** RFC 5280: 2049년까지는 UTCTime, 2050년부터는 GeneralizedTime */
    public static byte[] time(Date date) {
        ZonedDateTime t = date.toInstant().atZone(ZoneOffset.UTC);
        if (t.getYear() < 2050) {
            return tlv(UTC_TIME, t.format(UTC_FMT).getBytes(StandardCharsets.US_ASCII));
        }
        return tlv(GENERALIZED_TIME, t.format(GEN_FMT).getBytes(StandardCharsets.US_ASCII));
    }
}
