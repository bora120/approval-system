package com.example.approval.messenger;

/** 메신저 관련 제한값을 한 곳에 모아 둔다 (프론트 features/messenger/constants.ts 와 맞출 것) */
public final class MessengerLimits {

    private MessengerLimits() {}

    /** 첨부파일(암호화된 상태) 최대 크기: 20MB */
    public static final long MAX_FILE_BYTES = 20L * 1024 * 1024;

    /** 암호화된 본문(base64) 최대 길이. 텍스트 2,000자 + 첨부파일 정보가 충분히 들어가는 크기 */
    public static final int MAX_CIPHERTEXT_LENGTH = 50_000;

    /** RSA-2048 로 암호화한 AES 키 / RSA-PSS 서명(base64) 최대 길이 */
    public static final int MAX_RSA_VALUE_LENGTH = 1024;

    /** AES-GCM IV(12바이트) 의 base64 길이 */
    public static final int IV_LENGTH = 16;

    /** 공개키(JWK) 문자열 최대 길이 */
    public static final int MAX_PUBLIC_KEY_LENGTH = 2000;

    /** 한 번에 내려주는 메시지 수 */
    public static final int DEFAULT_PAGE_SIZE = 50;
    public static final int MAX_PAGE_SIZE = 100;
}
